use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::HashSet;
use std::sync::{LazyLock, Mutex};
use tantivy::collector::TopDocs;
use tantivy::query::{BooleanQuery, BoostQuery, DfaWrapper, FuzzyTermQuery, Occur, Query, RegexQuery, TermQuery};
use tantivy::schema::{Field, IndexRecordOption, Schema, Value as TantivyValue, STORED, TEXT};
use tantivy::tokenizer::{LowerCaser, RemoveLongFilter, SimpleTokenizer, TextAnalyzer, MAX_TOKEN_LEN};
use tantivy::{doc, Index, IndexReader, TantivyDocument, Term};
use tantivy_fst::Automaton;

struct SearchIndex {
    fingerprint: [u8; 32],
    index: Index,
    reader: IndexReader,
    documents: Vec<Value>,
    title: Field,
    body: Field,
    context: Field,
    position: Field,
}

static CACHE: LazyLock<Mutex<Option<SearchIndex>>> = LazyLock::new(|| Mutex::new(None));

fn string<'a>(document: &'a Value, field: &str) -> &'a str {
    document.get(field).and_then(Value::as_str).unwrap_or("")
}

impl SearchIndex {
    fn new(documents: Vec<Value>, fingerprint: [u8; 32]) -> Result<Self, String> {
        let mut schema = Schema::builder();
        let title = schema.add_text_field("title", TEXT);
        let body = schema.add_text_field("body", TEXT);
        let context = schema.add_text_field("context", TEXT);
        let position = schema.add_u64_field("position", STORED);
        let index = Index::create_in_ram(schema.build());
        index.tokenizers().register("default", TextAnalyzer::builder(SimpleTokenizer::default())
            .filter(RemoveLongFilter::limit(MAX_TOKEN_LEN))
            .filter(LowerCaser)
            .build());
        let mut writer = index.writer_with_num_threads::<TantivyDocument>(1, 15_000_000).map_err(|error| error.to_string())?;
        for (number, document) in documents.iter().enumerate() {
            let is_comment = string(document, "kind") == "Comment";
            writer.add_document(doc!(
                title => if is_comment { "" } else { string(document, "title") },
                body => string(document, "body"),
                context => if is_comment { string(document, "title") } else { string(document, "searchContext") },
                position => number as u64
            )).map_err(|error| error.to_string())?;
        }
        writer.commit().map_err(|error| error.to_string())?;
        drop(writer);
        let reader = index.reader().map_err(|error| error.to_string())?;
        Ok(Self { fingerprint, index, reader, documents, title, body, context, position })
    }

    fn word_query(&self, word: &str, fields: &[(Field, f32)]) -> Result<Box<dyn Query>, String> {
        let mut clauses: Vec<(Occur, Box<dyn Query>)> = Vec::new();
        for (field, boost) in fields {
            let term = Term::from_field_text(*field, word);
            let prefix = FuzzyTermQuery::new_prefix(term.clone(), if word.chars().count() >= 4 { 1 } else { 0 }, true);
            clauses.push((Occur::Should, Box::new(BoostQuery::new(Box::new(prefix), *boost))));
            let infix = RegexQuery::from_pattern(&format!(".*{word}.*"), *field).map_err(|error| error.to_string())?;
            clauses.push((Occur::Should, Box::new(BoostQuery::new(Box::new(infix), *boost))));
            let exact = TermQuery::new(term, IndexRecordOption::WithFreqs);
            clauses.push((Occur::Should, Box::new(BoostQuery::new(Box::new(exact), boost * 2.0))));
        }
        Ok(Box::new(BooleanQuery::new(clauses)))
    }

    fn matched_terms(&self, text: &str, words: &[String], automata: &[DfaWrapper]) -> Result<Vec<String>, String> {
        let mut tokenizer = self.index.tokenizers().get("default").ok_or("Missing search tokenizer")?;
        let mut stream = tokenizer.token_stream(text);
        let mut matches = Vec::new();
        while stream.advance() && matches.len() < 64 {
            let token = stream.token();
            if words.iter().zip(automata).any(|(word, automaton)| {
                let state = token.text.bytes().fold(automaton.start(), |state, byte| automaton.accept(&state, byte));
                token.text.contains(word) || automaton.is_match(&state)
            }) {
                let original = &text[token.offset_from..token.offset_to];
                if !matches.iter().any(|value| value == original) { matches.push(original.to_owned()); }
            }
        }
        Ok(matches)
    }

    fn search(&self, query: &str) -> Result<Vec<Value>, String> {
        let mut tokenizer = self.index.tokenizers().get("default").ok_or("Missing search tokenizer")?;
        let mut stream = tokenizer.token_stream(query);
        let mut words = Vec::new();
        while stream.advance() {
            let word = stream.token().text.clone();
            if !words.contains(&word) { words.push(word); }
        }
        if words.is_empty() || self.documents.is_empty() { return Ok(Vec::new()); }
        let fields = [(self.title, 3.0), (self.body, 1.0), (self.context, 0.5)];
        let clauses = |fields: &[(Field, f32)], occur| words.iter().map(|word| self.word_query(word, fields).map(|query| (occur, query))).collect::<Result<Vec<_>, _>>();
        let query = BooleanQuery::new(clauses(&fields, Occur::Must)?);
        let body_query = BooleanQuery::new(clauses(&[(self.body, 1.0)], Occur::Should)?);
        let title_query = BooleanQuery::new(clauses(&[(self.title, 1.0)], Occur::Must)?);
        let automata = words.iter().map(|word| FuzzyTermQuery::new_prefix(
            Term::from_field_text(self.body, word), if word.chars().count() >= 4 { 1 } else { 0 }, true
        ).automaton().map_err(|error| error.to_string())).collect::<Result<Vec<_>, _>>()?;
        let searcher = self.reader.searcher();
        let limit = self.documents.len();
        let body_matches: HashSet<_> = searcher.search(&body_query, &TopDocs::with_limit(limit).order_by_score()).map_err(|error| error.to_string())?.into_iter().map(|(_, address)| address).collect();
        let title_matches: HashSet<_> = searcher.search(&title_query, &TopDocs::with_limit(limit).order_by_score()).map_err(|error| error.to_string())?.into_iter().map(|(_, address)| address).collect();
        let mut matches = Vec::new();
        for (score, address) in searcher.search(&query, &TopDocs::with_limit(limit).order_by_score()).map_err(|error| error.to_string())? {
            let indexed: TantivyDocument = searcher.doc(address).map_err(|error| error.to_string())?;
            let Some(position) = indexed.get_first(self.position).and_then(|value| value.as_u64()) else { continue };
            let Some(document) = self.documents.get(position as usize) else { continue };
            if string(document, "kind") == "Comment" && !body_matches.contains(&address) { continue; }
            let task_boost = if string(document, "kind") == "Task" { 1.15 } else { 1.0 };
            let mut result = document.clone();
            if string(document, "kind") == "Task" { result["titleMatched"] = Value::Bool(title_matches.contains(&address)); }
            result["titleMatches"] = serde_json::to_value(self.matched_terms(string(document, "title"), &words, &automata)?).map_err(|error| error.to_string())?;
            result["bodyMatches"] = serde_json::to_value(self.matched_terms(string(document, "body"), &words, &automata)?).map_err(|error| error.to_string())?;
            matches.push((score * task_boost, result));
        }
        matches.sort_by(|(left_score, left), (right_score, right)| right_score.total_cmp(left_score).then_with(|| string(left, "id").cmp(string(right, "id"))));
        Ok(matches.into_iter().map(|(_, document)| document).collect())
    }
}

pub(super) fn search(mut documents: Vec<Value>, query: &str) -> Result<Vec<Value>, String> {
    documents.sort_by(|left, right| string(left, "id").cmp(string(right, "id")));
    let serialized = serde_json::to_vec(&documents).map_err(|error| error.to_string())?;
    let fingerprint: [u8; 32] = Sha256::digest(&serialized).into();
    let mut cache = CACHE.lock().map_err(|_| "Search index is unavailable")?;
    if cache.as_ref().is_none_or(|index| index.fingerprint != fingerprint) {
        *cache = Some(SearchIndex::new(documents, fingerprint)?);
    }
    cache.as_ref().ok_or_else(|| "Search index is unavailable".to_string())?.search(query)
}

#[cfg(test)]
mod tests {
    use super::search;
    use serde_json::{json, Value};

    fn document(id: &str, kind: &str, title: &str, body: &str, context: &str) -> Value {
        json!({"id": id, "kind": kind, "title": title, "body": body, "searchContext": context})
    }

    fn ids(documents: Vec<Value>, query: &str) -> Vec<String> {
        search(documents, query).unwrap().iter().map(|document| document["id"].as_str().unwrap().to_owned()).collect()
    }

    #[test]
    fn matches_typing_errors_prefixes_and_context() {
        let documents = vec![
            document("task", "Task", "Release overview", "", ""),
            document("chat", "Chat", "Crash on startup", "Crash on startup", "Release overview"),
            document("memory", "Memory", "navigation.md", "Keyboard shortcuts", ""),
        ];
        assert_eq!(ids(documents.clone(), "release crash"), ["chat"]);
        assert_eq!(ids(documents.clone(), "crsh"), ["chat"]);
        assert_eq!(ids(documents.clone(), "keyb"), ["memory"]);
        assert!(ids(documents.clone(), "release nonexistent").is_empty());
        assert!(ids(documents, "  ").is_empty());
    }

    #[test]
    fn finds_long_identifiers_and_infixes() {
        let hash = "8713d7c020acd997d9ea712c754ca207e47dffdf";
        let documents = vec![
            document("hash", "Chat", "Commit", &format!("Fix in commit {hash}"), ""),
            document("code", "Chat", "Code", "Find SpotlightSearch component", ""),
        ];
        assert_eq!(ids(documents.clone(), hash), ["hash"]);
        assert_eq!(ids(documents.clone(), "8713d7c"), ["hash"]);
        assert_eq!(ids(documents, "Search"), ["code"]);
    }

    #[test]
    fn returns_original_terms_for_fuzzy_and_infix_highlighting() {
        let documents = vec![document("memory", "Memory", "notes.md", "Before monthly SpotlightSearch after", "")];
        let fuzzy = search(documents.clone(), "mnthly").unwrap();
        assert_eq!(fuzzy[0]["bodyMatches"], json!(["monthly"]));
        let infix = search(documents, "Search").unwrap();
        assert_eq!(infix[0]["bodyMatches"], json!(["SpotlightSearch"]));
    }

    #[test]
    fn comments_need_a_body_match_but_can_match_task_context() {
        let documents = vec![
            document("unrelated", "Comment", "Check release", "Tests passed.", ""),
            document("partial", "Comment", "Check release", "Follow-up after release.", ""),
            document("matching", "Comment", "Check release", "Check release notes.", ""),
        ];
        let results = ids(documents.clone(), "check release");
        assert!(results.contains(&"partial".to_owned()));
        assert!(results.contains(&"matching".to_owned()));
        assert!(!results.contains(&"unrelated".to_owned()));
        assert_eq!(ids(documents, "check follow-up"), ["partial"]);
    }

    #[test]
    fn changed_and_deleted_documents_replace_cached_results() {
        let original = vec![document("task", "Task", "Keyboard search", "Old café notes", "")];
        assert_eq!(ids(original.clone(), "café"), ["task"]);
        assert_eq!(ids(original, "keyb"), ["task"]);
        let updated = vec![document("task", "Task", "Keyboard search", "New notes", "")];
        assert!(ids(updated, "café").is_empty());
        assert!(ids(vec![], "keyboard").is_empty());
    }

    #[test]
    fn relevance_and_ties_are_stable() {
        let documents = vec![
            document("task", "Task", "Unrelated", "Notes about crash on startup", ""),
            document("chat", "Chat", "Crash on startup", "Crash on startup", ""),
        ];
        assert_eq!(ids(documents.clone(), "crash on startup")[0], "chat");
        let mut reversed = documents.clone();
        reversed.reverse();
        assert_eq!(ids(documents, "crash"), ids(reversed, "crash"));
    }

    #[test]
    fn marks_the_matched_task_field_for_navigation() {
        let documents = vec![document("task", "Task", "Monthly report", "A description about navigation", "")];
        assert_eq!(search(documents.clone(), "mnthly").unwrap()[0]["titleMatched"], true);
        assert_eq!(search(documents, "navigation").unwrap()[0]["titleMatched"], false);
    }
}
