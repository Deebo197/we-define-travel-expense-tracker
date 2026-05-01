import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { PAID_BY_CODES } from "@/lib/constants";
import { useQueryClient } from "@tanstack/react-query";
import { Settings } from "lucide-react";

export default function ProfileCodePicker({ currentCode, currentPersonalCode }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState(currentCode || "");
  const [personalCode, setPersonalCode] = useState(currentPersonalCode || "");
  const [saving, setSaving] = useState(false);
  const queryClient = useQueryClient();

  const handleSave = async () => {
    setSaving(true);
    await base44.auth.updateMe({ paid_by_code: code, paid_by_code_personal: personalCode });
    await queryClient.invalidateQueries({ queryKey: ["currentUser"] });
    setSaving(false);
    setOpen(false);
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="p-2 rounded-xl transition-all duration-200 active:scale-95"
        style={{ color: "#6C6C80" }}
        title="Set staff profile"
        onMouseEnter={(e) => { e.currentTarget.style.color = "#7F5BFF"; e.currentTarget.style.backgroundColor = "rgba(127,91,255,0.1)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = "#6C6C80"; e.currentTarget.style.backgroundColor = "transparent"; }}
      >
        <Settings className="h-4 w-4" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Link Staff Profile</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Link your account to your staff codes so expenses are attributed correctly.
          </p>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Company Card Code <span className="text-xs text-muted-foreground">(no reimbursement)</span></Label>
              <Select value={code} onValueChange={setCode}>
                <SelectTrigger>
                  <SelectValue placeholder="Select company card code" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={null}>— None —</SelectItem>
                  {PAID_BY_CODES.filter(p => !p.reimbursement).map(p => (
                    <SelectItem key={p.code} value={p.code}>{p.code} — {p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Personal Code <span className="text-xs text-muted-foreground">(reimbursement required)</span></Label>
              <Select value={personalCode} onValueChange={setPersonalCode}>
                <SelectTrigger>
                  <SelectValue placeholder="Select personal code" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={null}>— None —</SelectItem>
                  {PAID_BY_CODES.filter(p => p.reimbursement).map(p => (
                    <SelectItem key={p.code} value={p.code}>{p.code} — {p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button onClick={handleSave} disabled={saving} className="w-full mt-2">
            {saving ? "Saving..." : "Save"}
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}