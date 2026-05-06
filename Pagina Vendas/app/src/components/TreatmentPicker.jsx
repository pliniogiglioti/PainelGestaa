import { useMemo, useState } from "react";
import { CATALOG } from "../data/catalog";

export default function TreatmentPicker({ onAdd }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return CATALOG;
    return CATALOG.map((group) => ({
      ...group,
      items: group.items.filter((item) => item.name.toLowerCase().includes(term))
    })).filter((group) => group.items.length > 0);
  }, [query]);

  return (
    <div className="picker">
      <input
        className="picker-input"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="+ Adicionar tratamento"
      />
      <div className="picker-list">
        {filtered.map((group) => (
          <div key={group.name}>
            <div className="picker-group">{group.name}</div>
            {group.items.map((item) => (
              <button
                key={item.name}
                className="picker-item"
                type="button"
                onClick={() => onAdd(item.name)}
              >
                {item.name}
              </button>
            ))}
          </div>
        ))}
        {!filtered.length && <div className="picker-empty">Nenhum procedimento encontrado.</div>}
      </div>
    </div>
  );
}
