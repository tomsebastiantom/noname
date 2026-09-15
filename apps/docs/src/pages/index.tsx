import Link from "@docusaurus/Link";
import Layout from "@theme/Layout";
import Heading from "@theme/Heading";

const pillars = [
  {
    title: "Describe, don’t assemble",
    body: "Turn product intent into declarative specifications that can drive content, UI, machines, and integrations.",
  },
  {
    title: "People and agents build together",
    body: "The agent proposes, explains, and iterates. The person sets direction, reviews changes, and stays in control.",
  },
  {
    title: "One reusable foundation",
    body: "Reuse identity, documents, layouts, permissions, machines, capabilities, and integrations across verticals.",
  },
  {
    title: "Verticals prove the platform",
    body: "Commerce is a demanding example of what the foundation can support—not the limit of what Noname is.",
  },
];

const steps = [
  ["01", "Express intent", "Describe the outcome in human language, a schema, or an existing workflow."],
  ["02", "Shape together", "The agent turns intent into a reviewable spec while you guide the product and constraints."],
  ["03", "Run the system", "The same specification reaches the UI, backend machines, and integrations."],
  ["04", "Keep improving", "Observe the result, make a decision, and iterate without rebuilding the foundation."],
];

export default function Home(): JSX.Element {
  return (
    <Layout
      title="Build together with Noname"
      description="A reusable, AI-native platform where people and agents build software together."
    >
      <main>
        <section className="noname-hero">
          <div className="container noname-hero__inner">
            <div className="noname-eyebrow">The reusable foundation for AI-native software</div>
            <Heading as="h1">Build the next thing, together.</Heading>
            <p className="noname-hero__lead">
              Noname is an open platform where people and agents turn intent into living products—across content,
              interfaces, workflows, and integrations.
            </p>
            <div className="noname-hero__actions">
              <Link className="button button--primary button--lg" to="/docs/get-started/build-your-first-store">
                Start building
              </Link>
              <Link className="button button--secondary button--lg" to="/docs/concepts/vision">
                Read the vision
              </Link>
            </div>
            <div className="noname-hero__note">Open source · declarative · extensible · human-directed</div>
          </div>
        </section>

        <section className="noname-section noname-section--light">
          <div className="container">
            <div className="noname-section__intro">
              <div className="noname-eyebrow">What is Noname?</div>
              <Heading as="h2">A platform, not another closed product.</Heading>
              <p>
                Noname gives teams a durable set of primitives for building products that can change. You bring the
                intent and domain; the platform provides the reusable runtime.
              </p>
            </div>
            <div className="noname-pillar-grid">
              {pillars.map((pillar) => (
                <article className="noname-pillar" key={pillar.title}>
                  <Heading as="h3">{pillar.title}</Heading>
                  <p>{pillar.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="noname-section">
          <div className="container">
            <div className="noname-section__intro">
              <div className="noname-eyebrow">The build loop</div>
              <Heading as="h2">From intent to a working system.</Heading>
              <p>
                Noname keeps the human decision visible while making the path from idea to implementation shorter and
                more reusable.
              </p>
            </div>
            <div className="noname-step-grid">
              {steps.map(([number, title, body]) => (
                <article className="noname-step" key={number}>
                  <span className="noname-step__number">{number}</span>
                  <Heading as="h3">{title}</Heading>
                  <p>{body}</p>
                </article>
              ))}
            </div>
            <div className="noname-flow" aria-label="The Noname build loop">
              <span>human intent</span>
              <b>→</b>
              <span>agent proposal</span>
              <b>→</b>
              <span>reviewable spec</span>
              <b>→</b>
              <span>running product</span>
            </div>
          </div>
        </section>

        <section className="noname-section noname-section--dark">
          <div className="container noname-split">
            <div>
              <div className="noname-eyebrow">Commerce is a proving ground</div>
              <Heading as="h2">One foundation. Many products.</Heading>
            </div>
            <div>
              <p>
                Commerce gives the platform a real test: trusted pricing, durable workflows, provider callbacks,
                order projection, and auditable outcomes. The same primitives are designed to support other verticals,
                teams, and products.
              </p>
              <Link className="button button--outline button--lg" to="/docs/concepts/system-overview">
                Explore the architecture
              </Link>
            </div>
          </div>
        </section>

        <section className="noname-section noname-section--light">
          <div className="container noname-open-source">
            <div>
              <div className="noname-eyebrow">Built in the open</div>
              <Heading as="h2">Readable by people. Extendable by teams.</Heading>
              <p>
                The code, decisions, verification records, and historical context stay visible. Start with the guides,
                inspect the architecture, and contribute at the boundary where your idea belongs.
              </p>
            </div>
            <div className="noname-cta-stack">
              <Link className="button button--primary" to="/docs/get-started/local-development">
                Set up locally
              </Link>
              <Link className="button button--secondary" to="/docs/how-to/create-an-extension">
                Create an extension
              </Link>
              <Link className="noname-text-link" to="/docs/history/overview">
                See how the project documents decisions →
              </Link>
            </div>
          </div>
        </section>
      </main>
    </Layout>
  );
}
