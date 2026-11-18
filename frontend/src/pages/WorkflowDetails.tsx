import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { ApprovalDetailView } from '../components/approvals/ApprovalDetailView';
import { ExecutionRunner } from '../components/workflow/ExecutionRunner';
import { WorkflowPlanPreview } from '../components/assistant/WorkflowPlanPreview';
import { EmptyState } from '../components/common/EmptyState';
import { Workflow, ArrowLeft } from 'lucide-react';

export const WorkflowDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getWorkflowById, approveWorkflow, rejectWorkflow } = useApp();

  const workflow = id ? getWorkflowById(id) : undefined;
  const [isExecutingLocal, setIsExecutingLocal] = useState(false);

  if (!workflow) {
    return (
      <div className="max-w-xl mx-auto py-12">
        <EmptyState
          icon={Workflow}
          title="Workflow Not Found"
          description="The requested workflow could not be found or has been dismissed."
          actionLabel="Back to Approvals"
          onAction={() => navigate('/approvals')}
        />
      </div>
    );
  }

  const handleApproveAndExecute = async (wfId: string) => {
    setIsExecutingLocal(true);
    await approveWorkflow(wfId);
  };

  const handleReject = (wfId: string, reason?: string) => {
    rejectWorkflow(wfId, reason);
    navigate('/approvals');
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-200">
      {/* If the workflow is currently executing or locally triggered execution */}
      {workflow.status === 'executing' || isExecutingLocal || workflow.status === 'completed' ? (
        <ExecutionRunner
          workflow={workflow}
          onFinish={() => setIsExecutingLocal(false)}
        />
      ) : (
        /* Otherwise show Approval Inspection Detail */
        <ApprovalDetailView
          workflow={workflow}
          onApproveAndExecute={handleApproveAndExecute}
          onReject={handleReject}
        />
      )}
    </div>
  );
};
