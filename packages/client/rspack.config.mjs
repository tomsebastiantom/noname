import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { HtmlRspackPlugin } from "@rspack/core";

const dir = dirname(fileURLToPath(import.meta.url));
const extensionsDir = join(dir, "../extensions/src");
const isDev = process.env.NODE_ENV !== "production";

export default {
  entry: { main: "./src/main.tsx" },
  output: {
    filename: "[name].[contenthash:8].js",
    chunkFilename: "[name].[contenthash:8].js",
    clean: true,
  },
  target: "web",
  mode: isDev ? "development" : "production",
  devtool: "source-map",
  devServer: {
    port: 5173,
    hot: true,
    historyApiFallback: true,
    static: { directory: join(dir, "public") },
    // Edge worker (wrangler dev :8787) — start with: pnpm --filter @noname/workers dev
    proxy: [{ context: ["/api"], target: "http://localhost:8787" }],
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        include: [join(dir, "src"), extensionsDir],
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
      "@noname/extensions": join(dir, "../extensions/src/index.ts"),
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
        vendor: {
          test: /[\\/]node_modules[\\/]/,
          name: "vendor",
          chunks: "all",
        },
      },
    },
  },
};
