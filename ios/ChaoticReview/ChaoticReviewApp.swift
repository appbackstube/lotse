import SwiftUI
import UniformTypeIdentifiers

@main
struct ChaoticReviewApp: App {
    @StateObject private var store = ReviewStore()

    var body: some Scene {
        WindowGroup { ContentView().environmentObject(store) }
    }
}

struct ChangedFile: Identifiable, Hashable {
    let path: String
    let patch: String
    var id: String { path }
    var additions: Int { patch.split(separator: "\n").filter { $0.hasPrefix("+") && !$0.hasPrefix("+++") }.count }
    var deletions: Int { patch.split(separator: "\n").filter { $0.hasPrefix("-") && !$0.hasPrefix("---") }.count }
}

struct Playbook: Identifiable, Codable, Hashable {
    var id = UUID()
    var title: String
    var prompt: String
}

@MainActor
final class ReviewStore: ObservableObject {
    @Published var files: [ChangedFile] = []
    @Published var selectedFile: ChangedFile?
    @Published var playbooks: [Playbook] { didSet { save() } }

    private let key = "chaoticreview.playbooks"

    init() {
        playbooks = (try? JSONDecoder().decode([Playbook].self, from: UserDefaults.standard.data(forKey: key) ?? Data())) ?? []
    }

    func importDiff(_ url: URL) throws {
        guard url.startAccessingSecurityScopedResource() else { throw CocoaError(.fileReadNoPermission) }
        defer { url.stopAccessingSecurityScopedResource() }
        files = Self.parse(try String(contentsOf: url, encoding: .utf8))
        selectedFile = files.first
    }

    func save() { UserDefaults.standard.set(try? JSONEncoder().encode(playbooks), forKey: key) }

    private static func parse(_ diff: String) -> [ChangedFile] {
        var result: [ChangedFile] = []
        var path: String?
        var lines: [String] = []
        func finish() {
            if let path { result.append(ChangedFile(path: path, patch: lines.joined(separator: "\n"))) }
        }
        for line in diff.split(separator: "\n", omittingEmptySubsequences: false).map(String.init) {
            if line.hasPrefix("diff --git ") {
                finish(); lines = []
                let parts = line.split(separator: " ")
                path = parts.last.map { String($0).replacingOccurrences(of: "b/", with: "", options: [.anchored]) }
            }
            if path != nil { lines.append(line) }
        }
        finish()
        return result
    }
}

struct ContentView: View {
    @EnvironmentObject private var store: ReviewStore
    @State private var importing = false
    @State private var error: String?

    var body: some View {
        TabView {
            NavigationSplitView {
                List(store.files, selection: $store.selectedFile) { file in
                    VStack(alignment: .leading) {
                        Text(file.path).font(.system(.body, design: .monospaced))
                        Text("+\(file.additions)  −\(file.deletions)").font(.caption).foregroundStyle(.secondary)
                    }
                }
                .navigationTitle("Working Copy")
                .toolbar { Button("Import diff") { importing = true } }
            } detail: {
                if let file = store.selectedFile {
                    DiffView(file: file)
                } else {
                    ContentUnavailableView("No diff loaded", systemImage: "doc.text", description: Text("Import a git diff from Working Copy."))
                }
            }
            .tabItem { Label("Working Copy", systemImage: "doc.text") }

            PlaybooksView()
                .tabItem { Label("Playbooks", systemImage: "checklist") }
        }
        .fileImporter(isPresented: $importing, allowedContentTypes: [.plainText]) { result in
            do { try store.importDiff(try result.get()) } catch { self.error = error.localizedDescription }
        }
        .alert("Could not import diff", isPresented: .constant(error != nil), presenting: error) { _ in
            Button("OK") { error = nil }
        } message: { Text($0) }
    }
}

struct DiffView: View {
    let file: ChangedFile
    var body: some View {
        ScrollView {
            Text(file.patch).font(.system(.caption, design: .monospaced)).frame(maxWidth: .infinity, alignment: .leading).padding()
        }.navigationTitle(file.path).navigationBarTitleDisplayMode(.inline)
    }
}

struct PlaybooksView: View {
    @EnvironmentObject private var store: ReviewStore
    @State private var editing: Playbook?
    var body: some View {
        NavigationStack {
            List {
                ForEach(store.playbooks) { playbook in
                    Button(playbook.title) { editing = playbook }.foregroundStyle(.primary)
                }.onDelete { store.playbooks.remove(atOffsets: $0) }
            }
            .navigationTitle("Playbooks")
            .toolbar { Button("Add", systemImage: "plus") { editing = Playbook(title: "", prompt: "") } }
            .sheet(item: $editing) { playbook in PlaybookEditor(playbook: playbook) }
        }
    }
}

struct PlaybookEditor: View {
    @EnvironmentObject private var store: ReviewStore
    @Environment(\.dismiss) private var dismiss
    @State var playbook: Playbook
    var body: some View {
        NavigationStack {
            Form {
                TextField("Title", text: $playbook.title)
                Section("Prompt") { TextEditor(text: $playbook.prompt).frame(minHeight: 260) }
            }
            .navigationTitle("Playbook")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) { Button("Save") {
                    guard !playbook.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
                    if let index = store.playbooks.firstIndex(where: { $0.id == playbook.id }) { store.playbooks[index] = playbook } else { store.playbooks.append(playbook) }
                    dismiss()
                } }
            }
        }
    }
}
