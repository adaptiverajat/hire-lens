import { PageHeader } from '@/components/shared/page-header';
import { CreateJobForm } from '@/components/jobs/create-job-form';

export const metadata = { title: 'Create job - HireLens' };

export default function NewJobPage() {
  return (
    <>
      <PageHeader
        title="Create job"
        description="Upload a JD file or paste the text. The JD Agent extracts structured requirements once the job is saved."
      />
      <CreateJobForm />
    </>
  );
}
