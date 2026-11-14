/**
 * Types TypeScript générés depuis le schéma Supabase.
 *
 * Structure compatible avec @supabase/supabase-js v2.x — le type `GenericSchema`
 * exige Views, Functions et Relationships dans chaque table.
 * Sans ces champs, le client résout tous les types en `never`.
 *
 * Mise à jour manuelle — ou via `bunx supabase gen types typescript --local`
 * une fois l'environnement local Supabase configuré.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          display_name: string;
          avatar_url: string | null;
          phone: string | null;
          is_pro: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          display_name: string;
          avatar_url?: string | null;
          phone?: string | null;
          is_pro?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          display_name?: string;
          avatar_url?: string | null;
          phone?: string | null;
          is_pro?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };
      associations: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          rna_number: string | null;
          siret: string | null;
          verified_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          rna_number?: string | null;
          siret?: string | null;
          verified_at?: string | null;
        };
        Update: {
          name?: string;
          rna_number?: string | null;
          siret?: string | null;
          verified_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "associations_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      listings: {
        Row: {
          id: string;
          seller_id: string;
          association_id: string | null;
          mode: "particulier" | "pro" | "vehicule" | "don" | "don_association";
          status:
            | "draft"
            | "pending_review"
            | "pending_price_review"
            | "published"
            | "sold"
            | "withdrawn"
            | "rejected";
          title: string;
          description: string | null;
          category: string;
          condition:
            | "neuf-jamais-utilise" | "comme-neuf" | "tres-bon" | "bon" | "usage" | "defauts"
            | "neuf-emballe" | "neuf-deballe" | "occasion"
            | "excellent" | "moyen";
          age_years: number | null;
          ean: string | null;
          reference: string | null;
          reference_new_value_eur: number | null;
          price_new_source: string | null;
          price_new_confidence: "verified" | "equivalent" | "manual_admin" | null;
          price_new_fetched_at: string | null;
          max_price_eur: number | null;
          asked_price_eur: number | null;
          warranty_days: number;
          pro_config: Json | null;
          admin_reference_price_eur: number | null;
          admin_price_set_by: string | null;
          admin_price_set_at: string | null;
          rejection_reason: string | null;
          moderated_by: string | null;
          moderated_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          seller_id: string;
          association_id?: string | null;
          mode: "particulier" | "pro" | "vehicule" | "don" | "don_association";
          status?:
            | "draft"
            | "pending_review"
            | "pending_price_review"
            | "published"
            | "sold"
            | "withdrawn"
            | "rejected";
          title: string;
          description?: string | null;
          category: string;
          condition:
            | "neuf-jamais-utilise" | "comme-neuf" | "tres-bon" | "bon" | "usage" | "defauts"
            | "neuf-emballe" | "neuf-deballe" | "occasion"
            | "excellent" | "moyen";
          age_years?: number | null;
          ean?: string | null;
          reference?: string | null;
          reference_new_value_eur?: number | null;
          price_new_source?: string | null;
          price_new_confidence?: "verified" | "equivalent" | "manual_admin" | null;
          price_new_fetched_at?: string | null;
          max_price_eur?: number | null;
          asked_price_eur?: number | null;
          warranty_days?: number;
          pro_config?: Json | null;
          admin_reference_price_eur?: number | null;
          admin_price_set_by?: string | null;
          admin_price_set_at?: string | null;
        };
        Update: {
          title?: string;
          description?: string | null;
          category?: string;
          condition?:
            | "neuf-jamais-utilise" | "comme-neuf" | "tres-bon" | "bon" | "usage" | "defauts"
            | "neuf-emballe" | "neuf-deballe" | "occasion"
            | "excellent" | "moyen";
          age_years?: number | null;
          ean?: string | null;
          reference?: string | null;
          reference_new_value_eur?: number | null;
          price_new_source?: string | null;
          price_new_confidence?: "verified" | "equivalent" | "manual_admin" | null;
          price_new_fetched_at?: string | null;
          max_price_eur?: number | null;
          asked_price_eur?: number | null;
          warranty_days?: number;
          pro_config?: Json | null;
          status?:
            | "draft"
            | "pending_review"
            | "pending_price_review"
            | "published"
            | "sold"
            | "withdrawn"
            | "rejected";
          admin_reference_price_eur?: number | null;
          admin_price_set_by?: string | null;
          admin_price_set_at?: string | null;
          rejection_reason?: string | null;
          moderated_by?: string | null;
          moderated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "listings_seller_id_fkey";
            columns: ["seller_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "listings_association_id_fkey";
            columns: ["association_id"];
            isOneToOne: false;
            referencedRelation: "associations";
            referencedColumns: ["id"];
          },
        ];
      };
      listing_photos: {
        Row: {
          id: string;
          listing_id: string;
          storage_path: string;
          position: number;
          is_main: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          listing_id: string;
          storage_path: string;
          position?: number;
          is_main?: boolean;
        };
        Update: {
          position?: number;
          is_main?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "listing_photos_listing_id_fkey";
            columns: ["listing_id"];
            isOneToOne: false;
            referencedRelation: "listings";
            referencedColumns: ["id"];
          },
        ];
      };
      donations: {
        Row: {
          id: string;
          listing_id: string;
          beneficiary_id: string | null;
          association_id: string | null;
          status: "open" | "reserved" | "completed" | "cancelled";
          reserved_until: string | null;
          completed_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          listing_id: string;
          beneficiary_id?: string | null;
          association_id?: string | null;
          status?: "open" | "reserved" | "completed" | "cancelled";
          reserved_until?: string | null;
        };
        Update: {
          status?: "open" | "reserved" | "completed" | "cancelled";
          beneficiary_id?: string | null;
          association_id?: string | null;
          reserved_until?: string | null;
          completed_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "donations_listing_id_fkey";
            columns: ["listing_id"];
            isOneToOne: false;
            referencedRelation: "listings";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    // Requis par GenericSchema — vide mais doit être présent
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      listing_mode:
        | "particulier"
        | "pro"
        | "vehicule"
        | "don"
        | "don_association";
      listing_status:
        | "draft"
        | "pending_review"
        | "published"
        | "sold"
        | "withdrawn"
        | "rejected";
      item_condition:
        | "neuf-jamais-utilise" | "comme-neuf" | "tres-bon" | "bon" | "usage" | "defauts"
        | "neuf-emballe" | "neuf-deballe" | "occasion"
        | "excellent" | "moyen";
      donation_status: "open" | "reserved" | "completed" | "cancelled";
    };
    CompositeTypes: Record<string, never>;
  };
};
