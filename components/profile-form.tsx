"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

interface ProfileFormProps extends React.ComponentPropsWithoutRef<"div"> {
  initialFtp: number | null;
  initialWeight: number | null;
  userId: string;
}

export function ProfileForm({ className, initialFtp, initialWeight, userId, ...props }: ProfileFormProps) {
  const [ftp, setFtp] = useState<string>(initialFtp?.toString() ?? "");
  const [weight, setWeight] = useState<string>(initialWeight?.toString() ?? "");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const supabase = createClient();
    setIsLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const ftpValue = ftp ? parseInt(ftp, 10) : null;
      const weightValue = weight ? parseFloat(weight) : null;

      const { error } = await supabase
        .from("users")
        .upsert({
          id: userId,
          ftp: ftpValue,
          weight: weightValue,
          updated_at: new Date().toISOString(),
        });

      if (error) throw error;
      setSuccess("Profile updated successfully!");
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Profile Settings</CardTitle>
          <CardDescription>Update your training metrics to personalize your workout experience.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit}>
            <div className="flex flex-col gap-6">
              <div className="grid gap-2">
                <Label htmlFor="ftp">FTP (Functional Threshold Power)</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="ftp"
                    type="number"
                    placeholder="e.g., 250"
                    value={ftp}
                    onChange={(e) => setFtp(e.target.value)}
                  />
                  <span className="text-sm text-muted-foreground whitespace-nowrap">watts</span>
                </div>
                <p className="text-xs text-muted-foreground">Your maximum power output sustainable for one hour.</p>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="weight">Weight</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="weight"
                    type="number"
                    step="0.1"
                    placeholder="e.g., 70.5"
                    value={weight}
                    onChange={(e) => setWeight(e.target.value)}
                  />
                  <span className="text-sm text-muted-foreground whitespace-nowrap">kg</span>
                </div>
                <p className="text-xs text-muted-foreground">Your current body weight.</p>
              </div>

              {error && <p className="text-sm text-red-500">{error}</p>}
              {success && <p className="text-sm text-green-600">{success}</p>}

              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
