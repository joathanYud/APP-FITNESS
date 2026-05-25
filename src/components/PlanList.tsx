import type { Plan } from "../types";

export function PlanList({ plans }: { plans: Plan[] }) {
  return (
    <section className="panel list">
      <h2>Planos salvos</h2>
      {plans.map((plan) => (
        <article key={plan.id}>
          <b>{plan.title}</b>
          <span>
            {plan.kind} {plan.author ? `por ${plan.author.name}` : ""}
          </span>
          <pre>{plan.content}</pre>
        </article>
      ))}
    </section>
  );
}
