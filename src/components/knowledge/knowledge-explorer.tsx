'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { maskName } from '@/lib/utils/mask';
import { useDemo } from '@/lib/demo/store';
import { Database, Loader2, Plus, Search } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiClientError } from '@/lib/api/client';
import { EmptyState } from '@/components/shared/indicators';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { KnowledgeEntryRow } from '@/types/domain';

const KIND_LABELS: Record<string, string> = {
  approved_candidate: 'Approved',
  rejected_candidate: 'Rejected',
  override: 'Override',
  interview_assessment: 'Interview assessment',
  historical_case: 'Historical case',
  recruiter_note: 'Recruiter note',
};

interface SearchHit {
  id: string;
  owner_type: string;
  content: string;
  similarity: number;
  metadata: { title?: string; outcome?: string | null };
}

export function KnowledgeExplorer({
  entries,
  jobs,
  vectorCount,
}: {
  entries: KnowledgeEntryRow[];
  jobs: Array<{ id: string; title: string }>;
  vectorCount: number;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [searching, setSearching] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [jobId, setJobId] = useState<string>('none');
  const [saving, setSaving] = useState(false);

  const [kindFilter, setKindFilter] = useState<string>('all');

  const { state } = useDemo();

  async function search(event: React.FormEvent) {
    event.preventDefault();
    if (query.trim().length < 3) {
      toast.error('Enter at least 3 characters');
      return;
    }

    setSearching(true);
    try {
      const result = await api.post<{ results: SearchHit[] }>('/knowledge/search', {
        query: query.trim(),
        limit: 15,
      });
      setHits(result.results);
      if (result.results.length === 0) toast.info('No semantic matches found');
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : 'Search failed');
    } finally {
      setSearching(false);
    }
  }

  async function saveNote() {
    if (title.trim().length < 1 || content.trim().length < 20) {
      toast.error('Add a title and at least 20 characters of detail');
      return;
    }

    setSaving(true);
    try {
      await api.post('/knowledge', {
        kind: 'recruiter_note',
        title: title.trim(),
        content: content.trim(),
        job_id: jobId === 'none' ? null : jobId,
      });
      toast.success('Note saved and embedded for retrieval');
      setTitle('');
      setContent('');
      setJobId('none');
      setShowForm(false);
      startTransition(() => router.refresh());
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : 'Could not save the note');
    } finally {
      setSaving(false);
    }
  }

  const filtered =
    kindFilter === 'all' ? entries : entries.filter((entry) => entry.kind === kindFilter);

  const kinds = [...new Set(entries.map((e) => e.kind))];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Database className="size-4" aria-hidden />
          {entries.length} entries · {vectorCount.toLocaleString()} vectors indexed
        </div>
        <Button variant="outline" onClick={() => setShowForm((v) => !v)}>
          <Plus aria-hidden />
          Add note
        </Button>
      </div>

      {showForm && (
        <Card id="knowledge-new-note-card">
          <CardHeader>
            <CardTitle className="text-base">New recruiter note</CardTitle>
            <CardDescription>
              Captured hiring wisdom. This gets embedded and surfaces during future analyses.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="note_title">Title</Label>
                <Input
                  id="note_title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Backend hires without Kafka ramp up fine"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="note_job">Related job</Label>
                <Select value={jobId} onValueChange={(v) => setJobId(String(v))}>
                  <SelectTrigger id="note_job">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Not job-specific</SelectItem>
                    {jobs.map((job) => (
                      <SelectItem key={job.id} value={job.id}>
                        {job.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="note_content">Detail</Label>
              <Textarea
                id="note_content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={6}
                placeholder="What did you learn, and what should future evaluations do differently?"
              />
            </div>

            <div className="flex gap-2">
              <Button onClick={saveNote} disabled={saving}>
                {saving && <Loader2 className="animate-spin" aria-hidden />}
                Save note
              </Button>
              <Button variant="ghost" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card id="knowledge-search-card">
        <CardHeader>
          <CardTitle className="text-base">Semantic search</CardTitle>
          <CardDescription>
            Searches meaning, not keywords. This is the same retrieval the agents use.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={search} className="flex gap-2">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Senior backend candidates who were strong technically but rejected"
            />
            <Button type="submit" disabled={searching}>
              {searching ? <Loader2 className="animate-spin" aria-hidden /> : <Search aria-hidden />}
              Search
            </Button>
            {hits && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setHits(null);
                  setQuery('');
                }}
              >
                Clear
              </Button>
            )}
          </form>

          {hits && hits.length > 0 && (
            <ul className="mt-4 space-y-3">
              {hits.map((hit) => (
                <li key={hit.id} className="rounded-md border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium">
                      {hit.metadata?.title ?? 'Untitled'}
                    </p>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="font-normal">
                        {hit.owner_type.replace('_', ' ')}
                      </Badge>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {(hit.similarity * 100).toFixed(0)}% similar
                      </span>
                    </div>
                  </div>
                  <p className="mt-1.5 line-clamp-3 whitespace-pre-wrap text-xs text-muted-foreground">
                    {hit.content}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <div>
        <div className="mb-3 flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={kindFilter === 'all' ? 'default' : 'outline'}
            onClick={() => setKindFilter('all')}
          >
            All
          </Button>
          {kinds.map((kind) => (
            <Button
              key={kind}
              size="sm"
              variant={kindFilter === kind ? 'default' : 'outline'}
              onClick={() => setKindFilter(kind)}
            >
              {KIND_LABELS[kind] ?? kind}
            </Button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            title="No entries yet"
            description="Entries are created automatically when you record a review decision or a transcript is evaluated. You can also add notes by hand."
          />
        ) : (
          <div className="space-y-3">
            {filtered.map((entry) => (
              <Card key={entry.id} id={`knowledge-entry-card-${entry.id}`}>
                <CardHeader className="pb-2">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <CardTitle className="text-sm">{entry.title}</CardTitle>
                    <div className="flex flex-wrap gap-1.5">
                      <Badge variant="secondary">{KIND_LABELS[entry.kind] ?? entry.kind}</Badge>
                      {entry.outcome && (
                        <Badge
                          variant={entry.outcome === 'reject' ? 'destructive' : 'outline'}
                          className="font-normal"
                        >
                          {entry.outcome}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <CardDescription className="text-xs">
                    {[
                      entry.jobs?.title,
                      entry.candidates?.full_name ? maskName(entry.candidates.full_name, state.enabled) : null,
                      new Date(entry.created_at).toLocaleDateString(),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  <p className="whitespace-pre-wrap text-xs text-muted-foreground">
                    {entry.content}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
