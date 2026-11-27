import { createElement } from "react";
import type { RepositoryInfo } from "../types";

export function WindowRepositoryTitle({ repository }: { repository: RepositoryInfo | null }) {
  return createElement("span", { className: "window-repository-title", title: repository?.rootPath ?? "No repository open" }, repository?.name ?? "Open repository");
}
