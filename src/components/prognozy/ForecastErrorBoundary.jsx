import React from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export class ForecastErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("[Prognozy]", this.props.moduleName, error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <Alert variant="destructive" className="my-4">
          <AlertTitle>Błąd modułu: {this.props.moduleName}</AlertTitle>
          <AlertDescription className="space-y-2">
            <p className="text-sm">{this.state.error?.message || String(this.state.error)}</p>
            <Button type="button" size="sm" variant="outline" onClick={() => this.setState({ error: null })}>
              Spróbuj ponownie
            </Button>
          </AlertDescription>
        </Alert>
      );
    }
    return this.props.children;
  }
}
