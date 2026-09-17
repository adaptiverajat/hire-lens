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

        <div className="flex items-start gap-3">
          <Checkbox
            id="show-agent-runs-per-candidate"
            checked={demo.state.showAgentRunsPerCandidate}
            onCheckedChange={(checked) => demo.setShowAgentRunsPerCandidate(checked === true)}
          />
          <div>
            <Label htmlFor="show-agent-runs-per-candidate" className="font-medium">
              Show Agent runs per candidate
            </Label>
            <p className="text-xs text-muted-foreground">
              Show or hide the separate candidate workflow history. Under the hood follows Demo mode.
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <Checkbox
            id="show-tokens"
            checked={demo.state.showTokens}
            onCheckedChange={(checked) => {
              demo.setShowTokens(checked === true);
              startTransition(() => router.refresh());
            }}
          />
          <div>
            <Label htmlFor="show-tokens" className="font-medium">
              Show token usage
            </Label>
            <p className="text-xs text-muted-foreground">
              Show or hide token KPIs and token details throughout the application.
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <Checkbox
            id="show-next-dev-tools"
            checked={demo.state.showNextDevTools}
            onCheckedChange={(checked) => demo.setShowNextDevTools(checked === true)}
          />
          <div>
            <Label htmlFor="show-next-dev-tools" className="font-medium">
              Show Next.js developer tools
            </Label>
            <p className="text-xs text-muted-foreground">
              Show the bottom-left Next.js development menu. This has no effect in production.
            </p>
          </div>
        </div>

        {demo.state.enabled ? (
          <div className="space-y-3 rounded-md border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm text-muted-foreground">
              Use the &ldquo;Under the hood&rdquo; panel at the bottom of AI enabled pages to override prompts per agent in real time.
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
