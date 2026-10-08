"use client";

import { useState } from "react";
import { api, ErrorNote, useAction } from "./client";

export function TestMerchantForm() {
  const { busy, error, run } = useAction();
  const [name, setName] = useState("");
  const [category, setCategory] = useState("Food");
  const [amount, setAmount] = useState("");
  return (
    <form
      className="card flex flex-col gap-3 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => api("test-merchant", { name, category, amount: amount ? Number(amount) : null }), () => (setName(""), setAmount("")));
      }}
    >
      <div>
        <label htmlFor="tm-name" className="label">
          Shop name
        </label>
        <input id="tm-name" className="field" value={name} onChange={(e) => setName(e.target.value)} minLength={2} required />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="tm-cat" className="label">
            Category
          </label>
          <select id="tm-cat" className="field" value={category} onChange={(e) => setCategory(e.target.value)}>
            {["Food", "Travel", "Books", "Stationery", "Mobile", "Other"].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="tm-amt" className="label">
            Amount (optional)
          </label>
          <input id="tm-amt" className="field num" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, "").slice(0, 7))} />
        </div>
      </div>
      <ErrorNote error={error} />
      <button className="btn-primary" disabled={busy}>
        Create QR
      </button>
    </form>
  );
}
