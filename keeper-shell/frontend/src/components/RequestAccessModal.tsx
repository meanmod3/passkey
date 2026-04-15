import { useState } from 'react';
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Button,
  Field,
  Textarea,
  Dropdown,
  Option,
  Input,
  Spinner,
} from '@fluentui/react-components';
import type { RecordDTO } from '@keeper-shell/shared';
import { api, ApiError } from '../services/api';
import { TeamsBadge } from './TeamsBadge';

const DURATION_PRESETS = [15, 30, 60, 120, 240] as const;

export function RequestAccessModal({
  record,
  open,
  onClose,
  onCreated,
}: {
  record: RecordDTO | null;
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}): JSX.Element | null {
  const [reason, setReason] = useState('');
  const [durationPreset, setDurationPreset] = useState<number | 'custom'>(30);
  const [customDuration, setCustomDuration] = useState('30');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!record) return null;

  const duration = durationPreset === 'custom' ? Number(customDuration) : durationPreset;
  const canSubmit = reason.trim().length > 0 && Number.isFinite(duration) && duration > 0 && duration <= 480;

  async function handleSubmit(): Promise<void> {
    if (!canSubmit || !record) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.createRequest({
        recordId: record.id,
        reason: reason.trim(),
        requestedDurationMin: duration,
        notes: notes.trim() || undefined,
      });
      // reset and close
      setReason('');
      setNotes('');
      setDurationPreset(30);
      setCustomDuration('30');
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'failed to create request');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(_e, d) => !d.open && onClose()} modalType="modal">
      <DialogSurface>
        <DialogBody>
          <DialogTitle>Request access — {record.name}</DialogTitle>
          <DialogContent>
            <div className="flex flex-col gap-4 mt-2">
              <div className="flex items-center gap-2 text-[13px] text-[var(--text-muted)]">
                <TeamsBadge label="via Microsoft Teams" />
                <span>An adaptive card is sent to your approver. Approve / Deny happen in Teams.</span>
              </div>
              <Field label="Reason" required hint="Why do you need this lease?">
                <Textarea
                  value={reason}
                  onChange={(_e, d) => setReason(d.value)}
                  placeholder="Debugging pipeline latency, investigating incident..."
                  resize="vertical"
                  rows={3}
                />
              </Field>
              <Field label="Duration">
                <div className="flex items-center gap-2">
                  <Dropdown
                    value={durationPreset === 'custom' ? 'Custom' : `${durationPreset} min`}
                    selectedOptions={[String(durationPreset)]}
                    onOptionSelect={(_e, d) => {
                      if (d.optionValue === 'custom') setDurationPreset('custom');
                      else setDurationPreset(Number(d.optionValue));
                    }}
                  >
                    {DURATION_PRESETS.map((p) => (
                      <Option key={p} value={String(p)} text={`${p} min`}>
                        {p} min {p >= 60 ? `(${p / 60}h)` : ''}
                      </Option>
                    ))}
                    <Option value="custom" text="Custom">Custom</Option>
                  </Dropdown>
                  {durationPreset === 'custom' && (
                    <Input
                      type="number"
                      value={customDuration}
                      onChange={(_e, d) => setCustomDuration(d.value)}
                      min={1}
                      max={480}
                      contentAfter={<span className="text-sm text-neutral-500">min</span>}
                    />
                  )}
                </div>
              </Field>
              <Field label="Notes" hint="Optional context">
                <Textarea
                  value={notes}
                  onChange={(_e, d) => setNotes(d.value)}
                  placeholder="Incident #..."
                  rows={2}
                  resize="vertical"
                />
              </Field>
              {error && <p className="text-sm text-red-700">{error}</p>}
            </div>
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" onClick={onClose} disabled={submitting}>Cancel</Button>
            <Button appearance="primary" onClick={handleSubmit} disabled={!canSubmit || submitting}>
              {submitting ? <Spinner size="tiny" /> : 'Send via Teams'}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
