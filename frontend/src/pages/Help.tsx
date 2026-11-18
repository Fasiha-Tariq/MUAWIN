import React from 'react';
import { HelpCircle } from 'lucide-react';
import { PlaceholderPage } from '../components/common/PlaceholderPage';

export const Help: React.FC = () => {
  return (
    <PlaceholderPage
      title="Help & Documentation"
      subtitle="User manual, workflow execution guides, and system troubleshooting for instructors"
      icon={HelpCircle}
      phase="Phase 2"
      description="The Help & Documentation portal provides comprehensive guides on framing effective intent prompts, conducting live lecture capture sessions, understanding human approval safeguards, and resolving Moellim synchronization issues."
      plannedFeatures={[
        'Interactive quick-start walkthrough for newly assigned course instructors',
        'Voice prompt formula guide for creating error-free assignment directives',
        'Frequently Asked Questions (FAQs) regarding Moellim LMS compatibility',
        'System architecture diagram explaining the supervised agentic flow',
        'Direct feedback mechanism to the MUAWIN engineering team'
      ]}
    />
  );
};
