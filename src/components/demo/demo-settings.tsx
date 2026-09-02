'use client';

import { useDemo } from '@/lib/demo/store';
import { useRouter } from 'next/navigation';
import { startTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Cpu } from 'lucide-react';

export function DemoSettings() {
  const demo = useDemo();
  const router = useRouter();

  return (
    <Card id="settings-demo-mode-card" className="lg:col-span-2 border-amber-200 bg-amber-50/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Cpu className="h-4 w-4" />
          Demo mode
        </CardTitle>
        <CardDescription>
          Turn on the &ldquo;Under the hood&rdquo; panel to see real-time AI orchestration and edit prompts.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-start gap-3">
          <Checkbox
            id="demo-enabled"
            checked={demo.state.enabled}
            onCheckedChange={(checked) => { demo.setEnabled(checked === true); startTransition(() => router.refresh()); }}
          />
          <div>
            <Label htmlFor="demo-enabled" className="font-medium">
              Enable demo mode
            </Label>
            <p className="text-xs text-muted-foreground">
              Shows the live LangGraph orchestration view and lets you override prompts per agent.
            </p>
          </div>
        </div>

        {demo.state.enabled ? (
          <div className="space-y-3 rounded-md border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm text-muted-foreground">
              AI credentials are read from <code>.env.local</code>. You do not need to enter them
              again. Use the &ldquo;Under the hood&rdquo; panel at the bottom of AI pages to override
              prompts per agent in real time.
            </p>
          </div>
        ) : null}

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            localStorage.removeItem('hirelens_demo');
            window.location.reload();
          }}
        >
          Clear demo storage
        </Button>
      </CardContent>
    </Card>
  );
}
