import React from 'react';
import { Settings as SettingsIcon } from 'lucide-react';
import { PlaceholderPage } from '../components/common/PlaceholderPage';

export const Settings: React.FC = () => {
  return (
    <PlaceholderPage
      title="System Settings"
      subtitle="Instructor preferences, transcription options, and Moellim adapter connection credentials"
      icon={SettingsIcon}
      phase="Phase 2"
      description="The Settings panel configures instructor preferences, Moellim API/session authentication keys, audio device selections, bilingual transcription dictionaries, and notification thresholds."
      plannedFeatures={[
        'Riphah Moellim connection settings and automated session health check',
        'Microphone input selection, gain calibration, and noise cancellation levels',
        'Academic course mapping and default assignment submission templates',
        'Security thresholds: automatic approval locks and audit log retention policy',
        'Dark/light UI theme preference and institutional display profile'
      ]}
    />
  );
};
