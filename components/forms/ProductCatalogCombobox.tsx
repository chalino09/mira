"use client";

import { useMemo, useState } from "react";
import { TextInput } from "@/components/forms/FormControls";
import { normalizedProductName } from "@/lib/product-search";

export type ProductCatalogOption = {
  id: string;
  name: string;
  category?: string | null;
  composition?: string | null;
  description?: string | null;
};

export type ProductCatalogSelection = {
  productId: string;
  productName: string;
  category: string | null;
  composition: string;
};

export function ProductCatalogCombobox({
  allowCustom = true,
  ariaLabel = "Producto",
  composition = "",
  disabled,
  onChange,
  placeholder = "Buscar producto",
  productId,
  products,
  required,
  value
}: {
  allowCustom?: boolean;
  ariaLabel?: string;
  composition?: string | null;
  disabled?: boolean;
  onChange: (selection: ProductCatalogSelection) => void;
  placeholder?: string;
  productId: string;
  products: ProductCatalogOption[];
  required?: boolean;
  value: string;
}) {
  const [open, setOpen] = useState(false);
  const query = normalizedProductName(value);
  const exactMatch = products.find((product) => normalizedProductName(product.name) === query);
  const matches = useMemo(() => {
    if (!query) return products;
    return products.filter((product) => normalizedProductName([
      product.name,
      product.composition,
      product.description
    ].filter(Boolean).join(" ")).includes(query));
  }, [products, query]);

  const selectProduct = (product: ProductCatalogOption) => {
    onChange({
      productId: product.id,
      productName: product.name,
      category: product.category ?? null,
      composition: product.composition ?? ""
    });
    setOpen(false);
  };

  return (
    <div className="relative">
      <TextInput
        aria-label={ariaLabel}
        autoComplete="off"
        disabled={disabled}
        onBlur={() => setOpen(false)}
        onChange={(event) => {
          const nextName = event.target.value;
          const nextMatch = products.find((product) =>
            normalizedProductName(product.name) === normalizedProductName(nextName)
          );
          onChange({
            productId: nextMatch?.id ?? "",
            productName: nextName,
            category: nextMatch?.category ?? null,
            composition: nextMatch?.composition ?? ""
          });
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        required={required}
        value={value}
      />
      {open && !disabled ? (
        <div className="absolute left-0 right-0 top-full z-40 mt-1 max-h-72 overflow-auto border border-app-border bg-white shadow-lg">
          {matches.map((product) => (
            <button
              className="block w-full border-b border-app-border/60 px-3 py-2 text-left last:border-b-0 hover:bg-app-sidebar"
              key={product.id}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => selectProduct(product)}
              type="button"
            >
              <span className="block truncate text-sm font-medium text-app-text">{product.name}</span>
              {product.composition || product.description ? (
                <span className="block truncate text-xs text-app-muted">
                  {product.composition ?? product.description}
                </span>
              ) : null}
            </button>
          ))}
          {!matches.length ? (
            <p className="px-3 py-2 text-sm text-app-muted">No se encontraron productos.</p>
          ) : null}
          {allowCustom && value.trim() && !exactMatch ? (
            <button
              className="sticky bottom-0 block w-full border-t border-app-border bg-white px-3 py-2 text-left text-sm font-medium text-app-green hover:bg-app-soft"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onChange({ productId: "", productName: value.trim(), category: null, composition: "" });
                setOpen(false);
              }}
              type="button"
            >
              Agregar otro: {value.trim()}
            </button>
          ) : null}
        </div>
      ) : null}
      {productId && composition ? (
        <p className="mt-1 line-clamp-2 text-xs leading-5 text-app-muted">{composition}</p>
      ) : null}
    </div>
  );
}
