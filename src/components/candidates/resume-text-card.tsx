'use client';

import { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export function ResumeTextCard({ resumeRaw, demo }: { resumeRaw: string; demo: boolean }) {
  // PII stays hidden by default in Demo mode; expandable for verification.
  const [open, setOpen] = useState(!demo);

  useEffect(() => {
    if (demo) setOpen(false);
  }, [demo]);

  return (
    <Card id="analysis-resume-text-card">
      <CardHeader>
        <CardTitle>Raw resume text</CardTitle>
        <CardDescription>
          {open
            ? 'Original uploaded resume text.'
            : 'Collapsed to protect candidate PII. Expand to view the raw resume.'}
        </CardDescription>
        <CardAction>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-controls="analysis-resume-text-body"
            aria-label={open ? 'Collapse resume text' : 'Expand resume text'}
          >
            {open ? <ChevronUp aria-hidden /> : <ChevronDown aria-hidden />}
          </Button>
        </CardAction>
      </CardHeader>
      {open && (
        <CardContent id="analysis-resume-text-body">
          <p className="max-h-80 overflow-y-auto whitespace-pre-wrap text-xs text-muted-foreground">
            {resumeRaw}
          </p>
        </CardContent>
      )}
    </Card>
  );
}
