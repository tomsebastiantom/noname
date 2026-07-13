import { HtmlRspackPlugin } from "@rspack/core";

export default {
  entry: { main: "./src/main.tsx" },
  output: {
    filename: "[name].[contenthash:8].js",
    chunkFilename: "[name].[contenthash:8].js",
    clean: true,
  },
  target: "web",
  mode: process.env.NODE_ENV === "development" ? "development" : "production",
  devtool: "source-map",
  devServer: {
    port: 5173,
    hot: true,
    historyApiFallback: true,
    proxy: [{ context: ["/api"], target: "http://localhost:3000" }],
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: {
          loader: "builtin:swc-loader",
          options: {
            jsc: {
              parser: { syntax: "typescript", tsx: true },
              transform: {
                react: {
                  runtime: "automatic",
                  development: process.env.NODE_ENV === "development",
                  refresh: process.env.NODE_ENV === "development",
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
