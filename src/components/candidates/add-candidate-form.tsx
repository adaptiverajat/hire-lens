'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiClientError } from '@/lib/api/client';
import { redactResumePii } from '@/lib/ai/pii';
import { useDemo } from '@/lib/demo/store';
import { extractEmailFromText, extractFullNameFromText, extractPhoneFromText } from '@/lib/utils/extract-contact';
import { toCamelCase } from '@/lib/utils/mask';
import { DocumentUpload } from '@/components/shared/document-upload';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';

export function AddCandidateForm({ jobId, jobParsed }: { jobId: string; jobParsed: boolean }) {
  const router = useRouter();
  const demo = useDemo();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [resume, setResume] = useState('');
  const [originalResume, setOriginalResume] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [runAnalysis, setRunAnalysis] = useState(jobParsed);
  const [pending, setPending] = useState(false);
  const [step, setStep] = useState<string | null>(null);

  const tooShort = (originalResume ?? resume).trim().length < 50;

  // Auto-populate candidate details from the resume text when the user hasn't
  // already filled them in manually.
  useEffect(() => {
    if (tooShort) return;
    if (!fullName.trim()) {
      const name = extractFullNameFromText(resume);
      if (name) setFullName(toCamelCase(name) ?? '');
    }
    if (!email.trim()) {
      const extractedEmail = extractEmailFromText(resume);
      if (extractedEmail) setEmail(extractedEmail);
    }
    if (!phone.trim()) {
      const extractedPhone = extractPhoneFromText(resume);
      if (extractedPhone) setPhone(extractedPhone);
    }
  }, [resume, tooShort, fullName, email, phone]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (tooShort) {
      toast.error('Resume text must be at least 50 characters');
      return;
    }

    setPending(true);
    try {
      setStep('Saving candidate...');
      const effectiveName = toCamelCase(fullName.trim() || extractFullNameFromText(originalResume ?? resume) || 'Unnamed candidate') ?? 'Unnamed candidate';
      const candidate = await api.post<{ id: string }>(`/jobs/${jobId}/candidates`, {
        full_name: effectiveName,
        email: email.trim() || null,
        phone: phone.trim() || null,
        resume_raw: (originalResume ?? resume).trim(),
        source_file_name: fileName,
      });

      setStep('Extracting the profile with the Resume Agent...');
      try {
        await api.post(`/candidates/${candidate.id}/parse`);
      } catch (parseError) {
        toast.warning(
          parseError instanceof ApiClientError
            ? `Candidate saved, but resume parsing failed: ${parseError.message}`
            : 'Candidate saved, but resume parsing failed. Retry from the candidate page.'
        );
        router.push(`/candidates/${candidate.id}`);
        return;
      }

      if (runAnalysis && jobParsed) {
        setStep('Running gap analysis and drafting interview questions...');
        try {
          await api.post(`/candidates/${candidate.id}/analyze`);
          toast.success('Candidate added, analysed and question set generated');
        } catch (analysisError) {
          toast.warning(
            analysisError instanceof ApiClientError
              ? `Profile saved, but analysis failed: ${analysisError.message}`
              : 'Profile saved, but analysis failed. Retry from the candidate page.'
          );
        }
      } else {
        toast.success('Candidate added and resume parsed');
      }

      router.push(`/candidates/${candidate.id}`);
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : 'Could not add the candidate');
    } finally {
      setPending(false);
      setStep(null);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {!jobParsed && (
        <Alert>
          <AlertDescription>
            This job&apos;s requirements have not been extracted yet, so match analysis is
            unavailable. Parse the JD on the job page first, then analyse this candidate.
          </AlertDescription>
        </Alert>
      )}

      <Card id="add-candidate-resume-card">
        <CardHeader>
          <CardTitle>Resume</CardTitle>
          <CardDescription>
            Upload a PDF or DOCX, or paste the text. Contact details are auto-filled from the
            parsed resume where you leave them blank.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <DocumentUpload
            label="Upload resume"
            hint="PDF, DOCX or TXT up to 10MB. Contact details are auto-filled from the resume."
            onExtracted={(text, name) => {
              const extractedName = extractFullNameFromText(text);
              const extractedEmail = extractEmailFromText(text);
              const extractedPhone = extractPhoneFromText(text);
              setOriginalResume(text);
              setResume(demo.state.enabled ? redactResumePii(text, {
                names: [extractedName, fullName],
                emails: [extractedEmail, email],
                phones: [extractedPhone, phone],
              }) : text);
              setFileName(name);
              // Auto-fill name from resume text first, fall back to filename.
              if (!fullName.trim()) {
                setFullName(toCamelCase(extractedName ?? name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim()) ?? '');
              }
              if (!email.trim() && extractedEmail) setEmail(extractedEmail);
              if (!phone.trim() && extractedPhone) setPhone(extractedPhone);
            }}
          />

          <div className="space-y-3">
            <Label htmlFor="resume">Resume text</Label>
            <Textarea
              id="resume"
              value={resume}
              onChange={(e) => setResume(e.target.value)}
              rows={16}
              placeholder="Paste the resume here..."
              required
            />
            <p className="text-xs text-muted-foreground">
              {resume.trim().length.toLocaleString()} characters
              {fileName && ` · from ${fileName}`}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card id="add-candidate-details-card">
        <CardHeader>
          <CardTitle>Candidate details</CardTitle>
          <CardDescription>
            Auto-detected from the resume. Edit if needed before saving.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 sm:grid-cols-3">
          <div className="space-y-3">
            <Label htmlFor="full_name">Full name</Label>
            <Input
              id="full_name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Auto-detected from resume if left blank"
              maxLength={200}
            />
          </div>
          <div className="space-y-3">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Auto-detected from resume"
            />
          </div>
          <div className="space-y-3">
            <Label htmlFor="phone">Phone</Label>
            <Input
              id="phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Auto-detected from resume"
            />
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        {jobParsed && (
          <div className="flex items-start gap-2">
            <Checkbox
              id="run_analysis"
              checked={runAnalysis}
              onCheckedChange={(checked) => setRunAnalysis(checked === true)}
            />
            <Label htmlFor="run_analysis" className="font-normal leading-snug">
              Run match analysis and generate interview questions immediately
              <span className="block text-xs text-muted-foreground">
                Adds roughly 30-60 seconds. You can also trigger this later.
              </span>
            </Label>
          </div>
        )}

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={pending || tooShort}>
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Sparkles aria-hidden />}
            Add candidate
          </Button>
          {step && <p className="text-sm text-muted-foreground">{step}</p>}
        </div>
      </div>
    </form>
  );
}
