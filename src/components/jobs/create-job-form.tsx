'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiClientError } from '@/lib/api/client';
import { DocumentUpload } from '@/components/shared/document-upload';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

interface Job {
  id: string;
}

// Lines that are almost never a job title — they're document headers or boilerplate.
const GENERIC_LINES = [
  /^(job description|about the role|we are hiring|about us|position|opportunity|role overview|job posting)\b/i,
  /^(we're looking for|we are looking for|join our team|about the position)\b/i,
  /^[-=*_~#]{2,}$/,
  /^(https?:\/\/|www\.)/i,
];

function extractTitleFromDescription(description: string): string | null {
  const lines = description.trim().split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length < 3 || trimmed.length > 200) continue;
    if (GENERIC_LINES.some((p) => p.test(trimmed))) continue;
    // Skip lines that are clearly sentences, not titles (contain a period in the first 40 chars).
    if (trimmed.slice(0, 40).includes('.')) continue;
    return trimmed.slice(0, 200);
  }
  return null;
}

export function CreateJobForm() {
  const router = useRouter();

  const [title, setTitle] = useState('');
  const [department, setDepartment] = useState('');
  const [location, setLocation] = useState('');
  const [deadline, setDeadline] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return d.toISOString().split('T')[0];
  });
  const [description, setDescription] = useState('');
  const [urgent, setUrgent] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [step, setStep] = useState<string | null>(null);

  const tooShort = description.trim().length < 50;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (tooShort) {
      toast.error('Job description must be at least 50 characters');
      return;
    }

    const effectiveTitle = title.trim() || extractTitleFromDescription(description) || 'Untitled role';

    setPending(true);
    try {
      setStep('Saving job...');
      const job = await api.post<Job>('/jobs', {
        title: effectiveTitle,
        description_raw: description.trim(),
        department: department.trim() || null,
        location: location.trim() || null,
        deadline_date: deadline ? new Date(deadline).toISOString() : null,
        priority: urgent ? 'urgent' : 'normal',
        source_file_name: fileName,
      });

      // Parsing is a separate call, so a model failure never loses the JD text.
      setStep('Extracting requirements with the JD Agent...');
      try {
        await api.post(`/jobs/${job.id}/parse`);
        toast.success('Job created and requirements extracted');
      } catch (parseError) {
        toast.warning(
          parseError instanceof ApiClientError
            ? `Job saved, but parsing failed: ${parseError.message}`
            : 'Job saved, but requirement extraction failed. You can retry from the job page.'
        );
      }

      router.push(`/jobs/${job.id}`);
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : 'Could not create the job');
    } finally {
      setPending(false);
      setStep(null);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card id="create-job-role-details-card">
        <CardHeader>
          <CardTitle>Role details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-6 sm:grid-cols-2">
          <div className="space-y-3 sm:col-span-2">
            <Label htmlFor="title">Job title</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Auto-detected from JD if left blank"
              maxLength={200}
            />
          </div>
          <div className="space-y-3">
            <Label htmlFor="department">Department</Label>
            <Input
              id="department"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              placeholder="Engineering"
            />
          </div>
          <div className="space-y-3">
            <Label htmlFor="location">Location</Label>
            <Input
              id="location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Remote / Bengaluru"
            />
          </div>
          <div className="space-y-3">
            <Label htmlFor="deadline">Application deadline</Label>
            <Input
              id="deadline"
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
            />
          </div>
          <div className="flex items-start gap-3 sm:col-span-2">
            <Checkbox
              id="urgent"
              checked={urgent}
              onCheckedChange={(checked) => setUrgent(checked === true)}
            />
            <div>
              <Label htmlFor="urgent" className="font-medium leading-none">
                Mark as urgent
              </Label>
              <p className="text-xs text-muted-foreground">
                Urgent jobs are highlighted on the dashboard and prioritised in the pipeline.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card id="create-job-description-card">
        <CardHeader>
          <CardTitle>Job description</CardTitle>
          <CardDescription>
            Upload a PDF or DOCX, or paste the text directly. Both end up in the same place.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <DocumentUpload
            label="Upload JD"
            hint="PDF, DOCX or TXT up to 10MB. Text is extracted into the box below, where you can edit it."
            onExtracted={(text, name) => {
              setDescription(text);
              setFileName(name);
              if (!title.trim()) {
                // Best-effort title suggestion from the filename.
                setTitle(name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim());
              }
            }}
          />

          <div className="space-y-3">
            <Label htmlFor="description">Description text</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={16}
              placeholder="Paste the full job description here..."
              required
            />
            <p className="text-xs text-muted-foreground">
              {description.trim().length.toLocaleString()} characters
              {tooShort && description.length > 0 && ' - needs at least 50'}
              {fileName && ` · from ${fileName}`}
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending || tooShort}>
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Sparkles aria-hidden />}
          Create and analyse
        </Button>
        {step && <p className="text-sm text-muted-foreground">{step}</p>}
      </div>
    </form>
  );
}
