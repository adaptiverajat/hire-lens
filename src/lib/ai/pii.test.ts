import { describe, expect, it } from 'vitest';
import { redactPii, redactResumePii, sanitizeLlmInput } from './pii';

describe('LLM PII redaction', () => {
  it('redacts known candidate PII and common contact formats', () => {
    const output = redactPii(
      'Rajat Srivastava | rajat@example.com | +91 98765 43210 | Example Institute of Technology',
      {
        names: ['Rajat Srivastava'],
        institutions: ['Example Institute of Technology'],
      },
    );

    expect(output).not.toContain('Rajat Srivastava');
    expect(output).not.toContain('rajat@example.com');
    expect(output).not.toContain('98765 43210');
    expect(output).not.toContain('Example Institute of Technology');
    expect(output).toContain('[PII REDACTED]');
  });

  it('removes education sections from resumes while retaining work history', () => {
    const output = redactResumePii(`Rajat Srivastava
rajat@example.com

EDUCATION
B.Tech, Example College of Engineering, 2020

EXPERIENCE
Backend Engineer
Built APIs`, { names: ['Rajat Srivastava'] });

    expect(output).not.toContain('Rajat Srivastava');
    expect(output).not.toContain('rajat@example.com');
    expect(output).not.toContain('Example College of Engineering');
    expect(output).toContain('EXPERIENCE');
    expect(output).toContain('Built APIs');
  });

  it('redacts private fields and PII nested in all model inputs', () => {
    const output = sanitizeLlmInput({
      candidateName: 'Rajat Srivastava',
      transcript: 'Rajat Srivastava studied at Example University and has 10 years of experience.',
      nested: { phone: '9876543210' },
    }, {
      names: ['Rajat Srivastava'],
      institutions: ['Example University'],
    });

    expect(JSON.stringify(output)).not.toContain('Rajat Srivastava');
    expect(JSON.stringify(output)).not.toContain('Example University');
    expect(JSON.stringify(output)).not.toContain('9876543210');
    expect(output.transcript).toContain('10 years');
  });
});
