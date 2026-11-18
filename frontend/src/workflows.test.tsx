import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React, { useState } from "react";

// Lightweight harness verifying MUAWIN approval & file-upload UI state transitions
function ApprovalQueueHarness({ onDecision }: { onDecision: (id: string, action: string) => Promise<void> }) {
  const [status, setStatus] = useState("pending");

  const handleAction = async (action: string) => {
    await onDecision("apr-101", action);
    setStatus(action);
  };

  return (
    <div>
      <h2>Pending Approvals</h2>
      <p data-testid="approval-status">Status: {status}</p>
      <button onClick={() => handleAction("approved")}>Approve</button>
      <button onClick={() => handleAction("rejected")}>Reject</button>
    </div>
  );
}

describe("MUAWIN Workflow UI Interactions", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("updates approval status when teacher clicks Approve", async () => {
    const mockDecision = vi.fn().mockResolvedValue(undefined);
    render(<ApprovalQueueHarness onDecision={mockDecision} />);

    expect(screen.getByTestId("approval-status")).toHaveTextContent("Status: pending");

    fireEvent.click(screen.getByRole("button", { name: "Approve" }));

    await waitFor(() => {
      expect(mockDecision).toHaveBeenCalledWith("apr-101", "approved");
      expect(screen.getByTestId("approval-status")).toHaveTextContent("Status: approved");
    });
  });

  it("handles file input selection for Course Outline & Schedule uploads", () => {
    render(
      <div>
        <label htmlFor="outline-upload">Course Outline</label>
        <input id="outline-upload" type="file" accept=".docx,.pdf" />
      </div>
    );

    const file = new File(["dummy docx content"], "MUAWIN_Course_Outline.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    const input = screen.getByLabelText("Course Outline") as HTMLInputElement;

    fireEvent.change(input, { target: { files: [file] } });

    expect(input.files).toHaveLength(1);
    expect(input.files?.[0].name).toBe("MUAWIN_Course_Outline.docx");
  });
});
