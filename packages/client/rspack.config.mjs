import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { HtmlRspackPlugin } from "@rspack/core";

const dir = dirname(fileURLToPath(import.meta.url));
const extensionsDir = join(dir, "../extensions/src");
const edgeDevPort = process.env.EDGE_DEV_PORT || "8787";
const isDev = process.env.NODE_ENV !== "production";

export default {
  entry: { main: "./src/main.tsx" },
  output: {
    filename: isDev ? "[name].js" : "[name].[contenthash:8].js",
    chunkFilename: isDev ? "[name].js" : "[name].[contenthash:8].js",
    publicPath: isDev ? "/" : "/_assets/",
    clean: !isDev,
  },
  target: "web",
  mode: isDev ? "development" : "production",
  devtool: "source-map",
  devServer: {
    port: 5173,
    hot: true,
    historyApiFallback: true,
    static: { directory: join(dir, "public") },
    // Edge worker (wrangler dev, default :8787) — must match workers/wrangler.toml [dev].port
    // Preserve browser Host (yogastore.localhost) so edge can resolve org on slug-less /api routes.
    proxy: [
      {
        context: ["/api"],
        target: `http://localhost:${edgeDevPort}`,
        changeOrigin: false,
      },
    ],
  },
  module: {
    rules: [
      {
        test: /\.css$/,
        type: "css",
        use: [
          {
            loader: "postcss-loader",
            options: {
              postcssOptions: {
                config: join(dir, "postcss.config.mjs"),
              },
            },
          },
        ],
        parser: {
          css: {
            // Inject Tailwind at runtime — default `link` export was not added to HTML.
            exportType: "style",
          },
        },
      },
      {
        test: /\.tsx?$/,
        include: [
          join(dir, "src"),
          extensionsDir,
          join(dir, "../auth/src"),
          join(dir, "../shared/src"),
          join(dir, "../documents/src"),
        ],
        use: {
          loader: "builtin:swc-loader",
          options: {
            jsc: {
              parser: { syntax: "typescript", tsx: true },
              transform: {
                react: {
                  runtime: "automatic",
                  development: isDev,
                  refresh: false,
                },
              },
            },
          },
        },
        type: "javascript/auto",
      },
    ],
  },
  resolve: {
    extensions: [".tsx", ".ts", ".jsx", ".js"],
    alias: {
      "@": join(dir, "src"),
      "@/": join(dir, "src/"),
      "@noname/extensions": join(dir, "../extensions/src/index.ts"),
      "@noname/extensions/commerce/catalog-schemas": join(
        dir,
        "../extensions/src/commerce/catalog-schemas.ts",
      ),
      "@noname/extensions/rich-text": join(dir, "../extensions/src/rich-text/index.ts"),
    },
  },
  plugins: [
    new HtmlRspackPlugin({
      template: "./index.html",
    }),
  ],
  optimization: {
    splitChunks: {
      chunks: "all",
      cacheGroups: {
        editor: {
          test: /[\\/]src[\\/]editor[\\/]/,
          name: "editor",
          chunks: "async",
        },
        vendor: {
          test: /[\\/]node_modules[\\/]/,
          name: "vendor",
          chunks: "all",
        },
      },
    },
  },
};
