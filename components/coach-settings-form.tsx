"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { updateCoachSettings, type CoachSettings } from "@/app/coach/actions";

interface CoachSettingsFormProps {
  initialSettings: CoachSettings;
}

export function CoachSettingsForm({ initialSettings }: CoachSettingsFormProps) {
  const [settings, setSettings] = useState<CoachSettings>(initialSettings);
  const [saving, setSaving] = useState(false);

  const toggle = async (key: keyof CoachSettings, value: boolean) => {
    const prev = settings;
    setSettings((s) => ({ ...s, [key]: value }));
    setSaving(true);
    const result = await updateCoachSettings({ [key]: value });
    if (!result.success) {
      setSettings(prev); // revert on error
    }
    setSaving(false);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">AI Coach Settings</CardTitle>
        <CardDescription>Configure proactive coaching features.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="weekly-summary">Weekly Training Summary</Label>
            <p className="text-xs text-muted-foreground">
              Receive an AI-generated summary of your training week with actionable insights.
            </p>
          </div>
          <Switch
            id="weekly-summary"
            checked={settings.weekly_summary_enabled}
            disabled={saving}
            onCheckedChange={(checked) => toggle("weekly_summary_enabled", checked)}
          />
        </div>

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="auto-analysis">Post-Ride Auto-Analysis</Label>
            <p className="text-xs text-muted-foreground">
              Automatically analyse new rides after syncing from Strava or Intervals.icu.
            </p>
          </div>
          <Switch
            id="auto-analysis"
            checked={settings.auto_analysis_enabled}
            disabled={saving}
            onCheckedChange={(checked) => toggle("auto_analysis_enabled", checked)}
          />
        </div>
      </CardContent>
    </Card>
  );
}
