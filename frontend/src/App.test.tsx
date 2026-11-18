import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

describe("MUAWIN Frontend Smoke Check", () => {
  it("renders UI elements in jsdom", () => {
    render(<div>MUAWIN Dashboard</div>);
    expect(screen.getByText("MUAWIN Dashboard")).toBeInTheDocument();
  });
});
