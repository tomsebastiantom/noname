import Link from "@docusaurus/Link";
import Layout from "@theme/Layout";
import Heading from "@theme/Heading";

export default function Home(): JSX.Element {
  return (
    <Layout title="Documentation" description="Build with Noname">
      <main className="hero hero--primary">
        <div className="container">
          <Heading as="h1" className="hero__title">
            Build with Noname
          </Heading>
          <p className="hero__subtitle">
            AI-native declarative full-stack platform documentation.
          </p>
          <Link className="button button--secondary button--lg" to="/docs/">
            Start here
          </Link>
        </div>
      </main>
    </Layout>
  );
}
