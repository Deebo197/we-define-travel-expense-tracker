import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Trash2, Loader2, MapPin, Calculator, AlertTriangle, Pencil } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import ClientSplitInput from "../components/ClientSplitInput";
import ReimbursementBadge from "../components/ReimbursementBadge";
import PersonAvatar from "../components/PersonAvatar";
import CategoryBadge from "../components/CategoryBadge";
import { VEHICLE_TYPES, PAID_BY_CODES, formatCurrency, formatDateUK, formatMonth, isReimbursementRequired, getCategoriesForClient, WDT_CATEGORIES, getMileageRate, getVehicleLabel } from "@/lib/constants";
import CategorySelectItem from "../components/CategorySelectItem";
import { toast } from "sonner";
import { generateReceiptCode } from "@/lib/receiptCodeGenerator";

export default function MileageLog() {
  const queryClient = useQueryClient();
  const { data: user } = useQuery({
    queryKey: ["currentUser"],
    queryFn: () => base44.auth.me(),
  });

  const isAdmin = user?.role === "admin";

  const { data: journeys = [], isLoading } = useQuery({
    queryKey: ["mileageJourneys"],
    queryFn: () => base44.entities.MileageJourney.list("-date", 500),
  });

  const userCodes = [user?.paid_by_code, user?.paid_by_code_personal].filter(Boolean);
  const myJourneys = isAdmin
    ? journeys
    : journeys.filter(j =>
        userCodes.includes(j.staff_member) ||
        j.created_by === user?.email ||
        j.staff_member === user?.email
      );

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(getDefaultForm());
  const [saving, setSaving] = useState(false);
  const [calculating, setCalculating] = useState(false);

  function getDefaultForm() {
    return {
      date: new Date().toISOString().split("T")[0],
      vehicle_type: "Car",
      purpose: "",
      paid_by: "",
      category: "",
      stops: [
        { label: "A", postcode: "" },
        { label: "B", postcode: "" },
      ],
      return_journey: false,
      total_miles: "",
      total_cost: "",
      client_allocations: [{ client_code: "", client_name: "", percentage: 100, amount: 0 }],
    };
  }

  const primaryMileageClient = form.client_allocations[0]?.client_code;
  // Show categories as soon as a client is selected (WD/WD1 → WDT categories, others → Client Expense categories)
  const mileageCategories = primaryMileageClient ? getCategoriesForClient(primaryMileageClient) : [];

  const addStop = () => {
    const labels = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    setForm(f => ({
      ...f,
      stops: [...f.stops, { label: labels[f.stops.length] || `${f.stops.length + 1}`, postcode: "" }],
    }));
  };

  const removeStop = (index) => {
    if (form.stops.length <= 2) return;
    const labels = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    setForm(f => ({
      ...f,
      stops: f.stops.filter((_, i) => i !== index).map((s, i) => ({ ...s, label: labels[i] || `${i + 1}` })),
    }));
  };

  const updateStop = (index, postcode) => {
    setForm(f => ({
      ...f,
      stops: f.stops.map((s, i) => i === index ? { ...s, postcode } : s),
    }));
  };

  const calculateDistance = async () => {
    setCalculating(true);
    const postcodes = form.stops.map(s => s.postcode).filter(Boolean);
    if (postcodes.length < 2) {
      setCalculating(false);
      return;
    }

    // Geocode each postcode via Nominatim
    const coords = [];
    for (const pc of postcodes) {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(pc + ', UK')}&format=json&limit=1`,
        { headers: { 'Accept-Language': 'en' } }
      );
      const data = await res.json();
      if (data[0]) coords.push({ lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) });
    }

    if (coords.length < 2) {
      setCalculating(false);
      return;
    }

    // Use OSRM (free routing API) to get actual driving distance
    const coordStr = coords.map(c => `${c.lon},${c.lat}`).join(';');
    const osrmRes = await fetch(
      `https://router.project-osrm.org/route/v1/driving/${coordStr}?overview=false`
    );
    const osrmData = await osrmRes.json();
    const distanceMetres = osrmData?.routes?.[0]?.distance || 0;
    let miles = Math.round((distanceMetres / 1609.34) * 10) / 10;

    if (form.return_journey) miles = Math.round(miles * 2 * 10) / 10;
    const rate = getMileageRate(form.vehicle_type, form.date);
    const cost = Math.round(miles * rate * 100) / 100;

    setForm(f => ({
      ...f,
      total_miles: miles,
      total_cost: cost,
      client_allocations: f.client_allocations.map(a => ({
        ...a,
        amount: Math.round((cost * (a.percentage || 0) / 100) * 100) / 100,
      })),
    }));
    setCalculating(false);
  };

  const generateRouteUrl = (stops) => {
    const postcodes = stops.map(s => s.postcode).filter(Boolean);
    if (postcodes.length < 2) return null;
    const encoded = postcodes.map(p => encodeURIComponent(p + ' UK')).join('/');
    return `https://www.google.com/maps/dir/${encoded}`;
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const primaryClient = form.client_allocations[0]?.client_code;
      const receiptCode = await generateReceiptCode(form.date);
      const month = formatMonth(form.date);
      const year = new Date(form.date).getFullYear();
      const paidByEntry = PAID_BY_CODES.find(p => p.code === form.paid_by);

      const journey = await base44.entities.MileageJourney.create({
        date: form.date,
        vehicle_type: form.vehicle_type,
        rate_per_mile: getMileageRate(form.vehicle_type, form.date),
        purpose: form.purpose,
        staff_member: form.paid_by,
        staff_member_name: paidByEntry?.label || form.paid_by,
        stops: form.stops,
        return_journey: form.return_journey,
        total_miles: parseFloat(form.total_miles) || 0,
        total_cost: parseFloat(form.total_cost) || 0,
        client_allocations: form.client_allocations,
        category: form.category || "",
        reimbursement_required: isReimbursementRequired(form.paid_by),
        reimbursement_paid: false,
        receipt_code: receiptCode,
        route_image_url: '',
        route_image_code: `ROUTE-${receiptCode}`,
        month,
        year,
      });

      // Generate and upload route image asynchronously (non-blocking)
      try {
        const postcodes = form.stops.map(s => s.postcode);
        const response = await base44.functions.invoke('generateRouteImage', { postcodes, journey_id: journey.id });
        if (response.data?.file_url) {
          await base44.entities.MileageJourney.update(journey.id, { route_image_url: response.data.file_url });
        }
      } catch (err) {
        console.error('Route image generation failed:', err);
      }

      queryClient.invalidateQueries({ queryKey: ["mileageJourneys"] });
      setShowForm(false);
      setForm(getDefaultForm());
    } catch (err) {
      toast.error(err.message || "Failed to save journey. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const [selectedIds, setSelectedIds] = useState([]);
  const toggleSelectId = (id) => setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const deleteJourneys = useMutation({
    mutationFn: async (ids) => {
      for (const id of ids) await base44.entities.MileageJourney.delete(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mileageJourneys"] });
      setSelectedIds([]);
    },
    onError: (err) => toast.error(err.message || "Failed to delete journeys"),
  });

  const saveEdit = useMutation({
    mutationFn: async ({ id, data }) => {
      await base44.entities.MileageJourney.update(id, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mileageJourneys"] });
      setEditJourney(null);
    },
    onError: (err) => toast.error(err.message || "Failed to save changes"),
  });

  const [editJourney, setEditJourney] = useState(null);
  const [editForm, setEditForm] = useState({});

  const openEdit = (j) => {
    setEditJourney(j);
    setEditForm({
      date: j.date,
      vehicle_type: j.vehicle_type || "Car",
      rate_per_mile: j.rate_per_mile ?? getMileageRate(j.vehicle_type || "Car", j.date),
      purpose: j.purpose,
      paid_by: j.staff_member || "",
      stops: j.stops?.length >= 2 ? j.stops : [{ label: "A", postcode: "" }, { label: "B", postcode: "" }],
      return_journey: j.return_journey || false,
      total_miles: j.total_miles,
      total_cost: j.total_cost,
      category: j.category || "",
      client_allocations: j.client_allocations || [{ client_code: "", client_name: "", percentage: 100, amount: 0 }],
    });
  };

  const [filterMonth, setFilterMonth] = useState("all");
  const [filterStaff, setFilterStaff] = useState("all");
  const months = [...new Set(myJourneys.map(j => j.month))].filter(Boolean);

  const filtered = myJourneys.filter(j => {
    if (filterMonth !== "all" && j.month !== filterMonth) return false;
    if (filterStaff !== "all" && j.staff_member !== filterStaff) return false;
    return true;
  });

  if (isLoading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Mileage Log</h1>
        <div className="flex gap-2">
          {selectedIds.length === 1 && (
            <Button size="sm" variant="outline" onClick={() => openEdit(filtered.find(j => j.id === selectedIds[0]))}>
              <Pencil className="h-4 w-4 mr-1" /> Edit
            </Button>
          )}
          {selectedIds.length > 0 && (
            <Button size="sm" variant="destructive" disabled={deleteJourneys.isPending}
              onClick={() => { if (confirm(`Delete ${selectedIds.length} journey(s)?`)) deleteJourneys.mutate(selectedIds); }}>
              <Trash2 className="h-4 w-4 mr-1" /> Delete {selectedIds.length}
            </Button>
          )}
          <Button onClick={() => setShowForm(true)} className="gap-1.5">
            <Plus className="h-4 w-4" /> New Journey
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-5">
        <Select value={filterMonth} onValueChange={setFilterMonth}>
          <SelectTrigger className="w-32 h-9 text-xs"><SelectValue placeholder="Month" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All months</SelectItem>
            {months.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
        {isAdmin && (
          <Select value={filterStaff} onValueChange={setFilterStaff}>
            <SelectTrigger className="w-36 h-9 text-xs"><SelectValue placeholder="Staff" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All staff</SelectItem>
              {PAID_BY_CODES.map(p => <SelectItem key={p.code} value={p.code}>{p.label}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Journey list */}
      <div className="bg-card rounded-xl border border-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              <th className="p-3 w-10">
                <Checkbox
                  checked={filtered.length > 0 && selectedIds.length === filtered.length}
                  onCheckedChange={v => setSelectedIds(v ? filtered.map(j => j.id) : [])}
                />
              </th>
              <th className="p-3 text-left">Date</th>
              {isAdmin && <th className="p-3 text-left">Staff</th>}
              <th className="p-3 text-left">Route</th>
              <th className="p-3 text-right">Miles</th>
              <th className="p-3 text-right">Cost</th>
              <th className="p-3 text-left">Client(s)</th>
              <th className="p-3 text-left">Category</th>
              <th className="p-3 text-center">Reimb.</th>
              <th className="p-3 text-left">Route Map</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(j => (
              <tr key={j.id} className={`border-t border-border hover:bg-muted/20 ${selectedIds.includes(j.id) ? "bg-primary/5" : ""}`}>
                <td className="p-3">
                  <Checkbox checked={selectedIds.includes(j.id)} onCheckedChange={() => toggleSelectId(j.id)} />
                </td>
                <td className="p-3 whitespace-nowrap">{formatDateUK(j.date)}</td>
                {isAdmin && (
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <PersonAvatar code={j.staff_member} size="sm" />
                      <span>{j.staff_member_name || j.staff_member}</span>
                    </div>
                  </td>
                )}
                <td className="p-3 text-muted-foreground">
                  {j.stops?.map(s => s.postcode).join(" → ")}{j.return_journey ? " (return)" : ""}
                </td>
                <td className="p-3 text-right">{j.total_miles}</td>
                <td className="p-3 text-right font-semibold">{formatCurrency(j.total_cost)}</td>
                <td className="p-3">{j.client_allocations?.map(a => a.client_code).join(", ")}</td>
                <td className="p-3">{j.category ? <CategoryBadge category={j.category} showLabel /> : <span className="text-xs text-muted-foreground">—</span>}</td>
                <td className="p-3 text-center">
                  <ReimbursementBadge required={j.reimbursement_required} paid={j.reimbursement_paid} />
                </td>
                <td className="p-3">
                  <div className="flex items-center gap-1.5">
                    {j.route_image_url ? (
                      <a href={j.route_image_url} target="_blank" rel="noopener noreferrer" className="text-primary text-xs hover:underline">
                        {j.route_image_code || 'View Route'}
                      </a>
                    ) : <span className="text-xs text-muted-foreground">—</span>}
                    {j.drive_sync_failed && (
                      <span title="Receipt not synced to Google Drive — please re-upload">
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />
                      </span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="py-12 text-center text-muted-foreground text-sm">No journeys recorded</div>
        )}
      </div>

      {/* Edit journey dialog */}
      <Dialog open={!!editJourney} onOpenChange={() => setEditJourney(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Mileage Journey</DialogTitle>
          </DialogHeader>
          {editJourney && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-sm font-medium">Date</Label>
                  <Input type="date" value={editForm.date} onChange={e => setEditForm(f => ({ ...f, date: e.target.value }))} className="mt-1" />
                </div>
                <div>
                  <Label className="text-sm font-medium">Vehicle</Label>
                  <Select value={editForm.vehicle_type} onValueChange={v => setEditForm(f => ({ ...f, vehicle_type: v }))}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {VEHICLE_TYPES.map(v => <SelectItem key={v.type} value={v.type}>{v.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label className="text-sm font-medium">Purpose</Label>
                <Textarea value={editForm.purpose} onChange={e => setEditForm(f => ({ ...f, purpose: e.target.value }))} className="mt-1" rows={2} />
              </div>

              <div>
                <Label className="text-sm font-medium">Paid By</Label>
                <Select value={editForm.paid_by} onValueChange={v => setEditForm(f => ({ ...f, paid_by: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select who paid" /></SelectTrigger>
                  <SelectContent>
                    {PAID_BY_CODES.map(p => <SelectItem key={p.code} value={p.code}>{p.code} — {p.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {/* Stops */}
              <div>
                <Label className="text-sm font-semibold">Route — Stops</Label>
                <div className="space-y-2 mt-2">
                  {editForm.stops?.map((stop, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
                        <span className="text-xs font-bold text-primary">{stop.label}</span>
                      </div>
                      <Input
                        value={stop.postcode}
                        onChange={e => setEditForm(f => ({ ...f, stops: f.stops.map((s, si) => si === i ? { ...s, postcode: e.target.value } : s) }))}
                        placeholder="Postcode"
                        className="flex-1"
                      />
                      {editForm.stops.length > 2 && (
                        <Button type="button" variant="ghost" size="icon" className="h-8 w-8"
                          onClick={() => {
                            const labels = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
                            setEditForm(f => ({ ...f, stops: f.stops.filter((_, si) => si !== i).map((s, si) => ({ ...s, label: labels[si] || `${si + 1}` })) }));
                          }}>
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
                <Button type="button" variant="outline" size="sm" className="mt-2"
                  onClick={() => {
                    const labels = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
                    setEditForm(f => ({ ...f, stops: [...f.stops, { label: labels[f.stops.length] || `${f.stops.length + 1}`, postcode: "" }] }));
                  }}>
                  <Plus className="h-3 w-3 mr-1" /> Add Stop
                </Button>
              </div>

              <div className="flex items-center gap-3">
                <Switch checked={editForm.return_journey} onCheckedChange={v => setEditForm(f => ({ ...f, return_journey: v }))} />
                <Label className="text-sm">Return journey</Label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-sm font-medium">Total Miles</Label>
                  <Input type="number" step="0.1" value={editForm.total_miles} onChange={e => setEditForm(f => ({ ...f, total_miles: parseFloat(e.target.value) || 0 }))} className="mt-1" />
                </div>
                <div>
                  <Label className="text-sm font-medium">Total Cost £</Label>
                  <Input type="number" step="0.01" value={editForm.total_cost} onChange={e => {
                    const cost = parseFloat(e.target.value) || 0;
                    setEditForm(f => ({
                      ...f,
                      total_cost: cost,
                      client_allocations: f.client_allocations.map(a => ({
                        ...a,
                        amount: Math.round((cost * (a.percentage || 0) / 100) * 100) / 100,
                      })),
                    }));
                  }} className="mt-1" />
                </div>
              </div>

              <div>
                <Label className="text-sm font-medium">Category</Label>
                {!editForm.client_allocations?.[0]?.client_code ? (
                  <p className="text-xs text-muted-foreground mt-1.5">Select a client allocation first to see relevant categories</p>
                ) : (
                  <Select value={editForm.category} onValueChange={v => setEditForm(f => ({ ...f, category: v }))}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Select category" /></SelectTrigger>
                    <SelectContent>
                      {getCategoriesForClient(editForm.client_allocations?.[0]?.client_code).map(c => (
                        <CategorySelectItem key={c} category={c} />
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              <div className="border-t border-border pt-4">
                <Label className="text-sm font-semibold mb-3 block">Client Allocation</Label>
                <ClientSplitInput
                  allocations={editForm.client_allocations}
                  onChange={a => {
                    const newPrimary = a[0]?.client_code;
                    const oldPrimary = editForm.client_allocations[0]?.client_code;
                    setEditForm(f => ({ ...f, client_allocations: a, category: newPrimary !== oldPrimary ? "" : f.category }));
                  }}
                  paidAmount={parseFloat(editForm.total_cost) || 0}
                />
              </div>

              <div className="flex gap-3 pt-2">
                <Button variant="outline" className="flex-1" onClick={() => setEditJourney(null)}>Cancel</Button>
                <Button className="flex-1" disabled={saveEdit.isPending}
                  onClick={() => {
                    const paidByEntry = PAID_BY_CODES.find(p => p.code === editForm.paid_by);
                    saveEdit.mutate({
                      id: editJourney.id,
                      data: {
                        ...editForm,
                        staff_member: editForm.paid_by,
                        staff_member_name: paidByEntry?.label || editForm.paid_by,
                        reimbursement_required: isReimbursementRequired(editForm.paid_by),
                        month: formatMonth(editForm.date),
                        year: new Date(editForm.date).getFullYear(),
                      }
                    });
                  }}>
                  {saveEdit.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null} Save Changes
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>


      {/* New journey dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Mileage Journey</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-sm font-medium">Date</Label>
                <Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className="mt-1" />
              </div>
              <div>
                <Label className="text-sm font-medium">Vehicle</Label>
                <Select value={form.vehicle_type} onValueChange={v => setForm(f => ({ ...f, vehicle_type: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {VEHICLE_TYPES.map(v => <SelectItem key={v.type} value={v.type}>{getVehicleLabel(v.type, form.date)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label className="text-sm font-medium">Purpose</Label>
              <Textarea value={form.purpose} onChange={e => setForm(f => ({ ...f, purpose: e.target.value }))} placeholder="e.g. Client site visit" className="mt-1" rows={2} />
            </div>

            <div>
              <Label className="text-sm font-medium">Paid By *</Label>
              <Select value={form.paid_by} onValueChange={v => setForm(f => ({ ...f, paid_by: v }))}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select who paid" /></SelectTrigger>
                <SelectContent>
                  {PAID_BY_CODES.map(p => (
                    <SelectItem key={p.code} value={p.code}>{p.code} — {p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {isReimbursementRequired(form.paid_by) && (
                <p className="text-xs text-primary font-medium mt-1">⚠ Reimbursement will be required</p>
              )}
            </div>

            {/* Stops */}
            <div>
              <Label className="text-sm font-semibold">Route — Stops</Label>
              <div className="space-y-2 mt-2">
                {form.stops.map((stop, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
                      <span className="text-xs font-bold text-primary">{stop.label}</span>
                    </div>
                    <Input
                      value={stop.postcode}
                      onChange={e => updateStop(i, e.target.value)}
                      placeholder="Postcode"
                      className="flex-1"
                    />
                    {form.stops.length > 2 && (
                      <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeStop(i)}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
              <Button type="button" variant="outline" size="sm" className="mt-2" onClick={addStop}>
                <Plus className="h-3 w-3 mr-1" /> Add Stop
              </Button>
            </div>

            <div className="flex items-center gap-3">
              <Switch checked={form.return_journey} onCheckedChange={v => setForm(f => ({ ...f, return_journey: v }))} />
              <Label className="text-sm">Return journey (doubles distance)</Label>
            </div>

            <Button type="button" variant="outline" className="w-full gap-2" onClick={calculateDistance} disabled={calculating}>
              {calculating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calculator className="h-4 w-4" />}
              Calculate Distance &amp; Cost
            </Button>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-sm font-medium">Total Miles</Label>
                <Input type="number" value={form.total_miles} onChange={e => {
                  const miles = parseFloat(e.target.value) || 0;
                  const cost = Math.round(miles * getMileageRate(form.vehicle_type, form.date) * 100) / 100;
                  setForm(f => ({ ...f, total_miles: e.target.value, total_cost: cost }));
                }} className="mt-1" />
              </div>
              <div>
                <Label className="text-sm font-medium">Total Cost £</Label>
                <Input type="number" step="0.01" value={form.total_cost} onChange={e => {
                  const cost = parseFloat(e.target.value) || 0;
                  setForm(f => ({
                    ...f,
                    total_cost: e.target.value,
                    client_allocations: f.client_allocations.map(a => ({
                      ...a,
                      amount: Math.round((cost * (a.percentage || 0) / 100) * 100) / 100,
                    })),
                  }));
                }} className="mt-1" />
              </div>
            </div>

            {/* Category — shown once a client allocation is selected */}
            <div>
              <Label className="text-sm font-medium">Category *</Label>
              {!primaryMileageClient ? (
                <p className="text-xs text-muted-foreground mt-1.5">Select a client allocation first to see relevant categories</p>
              ) : (
                <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select category" /></SelectTrigger>
                  <SelectContent>
                    {mileageCategories.map(c => (
                       <CategorySelectItem key={c} category={c} />
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Client split */}
            <div className="border-t border-border pt-4">
              <Label className="text-sm font-semibold mb-3 block">Client Allocation</Label>
              <ClientSplitInput
                allocations={form.client_allocations}
                onChange={a => {
                  const newPrimary = a[0]?.client_code;
                  const oldPrimary = form.client_allocations[0]?.client_code;
                  setForm(f => ({ ...f, client_allocations: a, category: newPrimary !== oldPrimary ? "" : f.category }));
                }}
                paidAmount={parseFloat(form.total_cost) || 0}
              />
            </div>

            <div className="flex gap-3 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button className="flex-1" onClick={handleSave} disabled={saving || !form.purpose || !form.paid_by}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <MapPin className="h-4 w-4 mr-1" />}
                Save Journey
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}