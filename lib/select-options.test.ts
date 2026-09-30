import assert from "node:assert/strict";
import test from "node:test";
import { createElement, Fragment } from "react";
import { selectOptions } from "./select-options.ts";

test("keeps productive areas and their placeholder inside a fragment", () => {
  const children = createElement(Fragment, null,
    createElement("option", { disabled: true, value: "" }, "Selecciona un invernadero"),
    ["area-1", "area-2"].map((id, index) =>
      createElement("option", { key: id, value: id }, `Área ${index + 1}`)
    )
  );

  assert.deepEqual(selectOptions(children).map(({ value, label, disabled }) => ({ value, label, disabled })), [
    { value: "", label: "Selecciona un invernadero", disabled: true },
    { value: "area-1", label: "Área 1", disabled: undefined },
    { value: "area-2", label: "Área 2", disabled: undefined }
  ]);
});

test("preserves group descriptions and disabled states through nested fragments", () => {
  const children = createElement(Fragment, null,
    createElement("optgroup", { label: "Módulos" },
      createElement(Fragment, null,
        createElement(Fragment, null,
          createElement("option", { value: "module-1", disabled: true }, "Módulo 1")
        )
      )
    )
  );

  assert.deepEqual(selectOptions(children), [
    { value: "module-1", label: "Módulo 1", description: "Módulos", disabled: true }
  ]);
});

test("keeps direct options, numeric values and implicit values", () => {
  assert.deepEqual(selectOptions([
    createElement("option", { key: "general", value: "" }, "General / sin módulo"),
    createElement("option", { key: "numeric", value: 2 }, "Módulo 2"),
    createElement("option", { key: "implicit" }, "Otro"),
    null,
    false,
    createElement("div", { key: "ignored" }, "No es una opción")
  ]).map(({ value, label }) => ({ value, label })), [
    { value: "", label: "General / sin módulo" },
    { value: "2", label: "Módulo 2" },
    { value: "Otro", label: "Otro" }
  ]);
});
