import type { SupabaseClient } from "@supabase/supabase-js";

export class FineTuningDatasetService {
  constructor(private client: SupabaseClient) {}

  async list(status?: string) {
    let query = this.client.from("fine_tuning_examples").select("*").order("created_at", { ascending: false });
    if (status) query = query.eq("quality_status", status);
    const { data, error } = await query.limit(500);
    if (error) throw error;
    return data ?? [];
  }

  async review(id: number, qualityStatus: "approved" | "rejected", adminId: string) {
    const { data, error } = await this.client.from("fine_tuning_examples").update({
      quality_status: qualityStatus,
      approved_by: qualityStatus === "approved" ? adminId : null,
      approved_at: qualityStatus === "approved" ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    }).eq("id", id).select("*").single();
    if (error) throw error;
    return data;
  }

  async exportApprovedJsonl() {
    const rows = await this.list("approved");
    return rows.map((row) => JSON.stringify({
      task_type: row.task_type,
      input: row.input_json,
      ideal_output: row.ideal_output_json,
      source_ids: row.source_ids ?? [],
    })).join("\n");
  }
}

