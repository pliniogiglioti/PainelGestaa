import { useState } from "react";
import SellerScreen from "./screens/SellerScreen";
import { usePlans } from "./hooks/usePlans";

export default function App() {
  const [world, setWorld] = useState("seller");
  const planApi = usePlans();

  return (
    <main className="app">
      <header className="app-header">
        <div>
          <p className="eyebrow">TOP V10</p>
          <h1>Transicao para React</h1>
          <p className="subtle">Base modular para reduzir risco na evolucao da ferramenta.</p>
        </div>
        <div className="world-switch">
          <button
            type="button"
            className={world === "owner" ? "is-active" : ""}
            onClick={() => setWorld("owner")}
          >
            Mundo do Dono
          </button>
          <button
            type="button"
            className={world === "seller" ? "is-active" : ""}
            onClick={() => setWorld("seller")}
          >
            Mundo do Vendedor
          </button>
        </div>
      </header>

      {world === "owner" ? (
        <section className="owner-placeholder">
          <h2>Owner World (fase seguinte)</h2>
          <p>
            Esta etapa fica preparada para a migracao do fluxo completo do dono.
            Neste primeiro pacote da V10 React, priorizamos extracao de catalogo,
            regras de preco e composicao de planos no vendedor.
          </p>
        </section>
      ) : (
        <SellerScreen {...planApi} />
      )}
    </main>
  );
}
