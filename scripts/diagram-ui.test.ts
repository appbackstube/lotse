import { parseMermaidToExcalidraw } from "@excalidraw/mermaid-to-excalidraw";

try {
  for (const definition of ["flowchart LR\n A[Start] --> B[Finish]", "sequenceDiagram\n Alice->>Bob: Hello", "classDiagram\n class Example {\n +run()\n }"]) {
    const { elements } = await parseMermaidToExcalidraw(definition);
    if (!elements.length) throw new Error(`Empty diagram: ${definition}`);
  }
  document.getElementById("result")!.textContent = "PASS: flowchart, sequence and class conversion, the updated diagram converter.";
} catch (error) {
  document.getElementById("result")!.textContent = `FAIL: ${error}`;
  console.error(error);
}
