import { Component, type ErrorInfo, type ReactNode, Suspense } from "react";

type EditorGateProps = {
  children: ReactNode;
};

type EditorGateState = {
  error: string | null;
};

/** Catches editor chunk/render failures instead of hanging on Suspense forever. */
export class EditorGate extends Component<EditorGateProps, EditorGateState> {
  state: EditorGateState = { error: null };

  static getDerivedStateFromError(error: Error): EditorGateState {
    return { error: error.message || "Editor failed to load" };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[editor] failed to load or render", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-12 text-center">
          <p className="text-destructive">Editor error: {this.state.error}</p>
          <p className="text-sm text-muted-foreground">
            Check the browser console, then reload without <code>?edit=true</code>.
          </p>
        </div>
      );
    }

    return (
      <Suspense
        fallback={
          <div className="flex min-h-0 flex-1 items-center justify-center p-12 text-muted-foreground">
            Loading editor…
          </div>
        }
      >
        {this.props.children}
      </Suspense>
    );
  }
}
