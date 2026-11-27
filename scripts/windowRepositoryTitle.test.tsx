import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { WindowRepositoryTitle } from "../src/components/WindowRepositoryTitle";

const repository = (name: string) => ({ rootPath: `/tmp/${name}`, name, currentBranch: "main", hasOrigin: false });
const renderTitle = (name: string | null) => renderToStaticMarkup(createElement(WindowRepositoryTitle, { repository: name === null ? null : repository(name) }));

assert.match(renderTitle(null), /Open repository/);
assert.match(renderTitle("first"), /title="\/tmp\/first">first</);
assert.match(renderTitle("second"), /title="\/tmp\/second">second</);
assert.match(renderTitle("first"), />first</, "Rendering another window must not change this window's title");
