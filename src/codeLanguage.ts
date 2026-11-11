import { LanguageDescription } from "@codemirror/language";
import { languages } from "@codemirror/language-data";

export function findCodeLanguage(value: string, byName = false) {
  return byName
    ? LanguageDescription.matchLanguageName(languages, value, true)
    : LanguageDescription.matchFilename(languages, value);
}
