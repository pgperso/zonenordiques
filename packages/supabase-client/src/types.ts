// Supabase database types.
//
// Currently hand-maintained and INCOMPLETE — tables/columns added by recent
// migrations are missing, which is why call sites still need `as unknown as`
// casts. Regenerate the real schema (one-time `supabase link` first):
//
//   npm run gen:types --workspace=@arena/supabase-client
//
// That overwrites this file with the generator's output; the casts can then
// be removed. Requires a SUPABASE_ACCESS_TOKEN (or an interactive login).

export type Database = {
  public: {
    Tables: {
      categories: {
        Row: {
          id: number;
          name: string;
          slug: string;
          icon: string | null;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: number;
          name: string;
          slug: string;
          icon?: string | null;
          sort_order?: number;
          created_at?: string;
        };
        Update: {
          id?: number;
          name?: string;
          slug?: string;
          icon?: string | null;
          sort_order?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      communities: {
        Row: {
          id: number;
          name: string;
          slug: string;
          description: string | null;
          logo_url: string | null;
          banner_url: string | null;
          primary_color: string;
          secondary_color: string;
          category_id: number | null;
          is_active: boolean;
          member_count: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: number;
          name: string;
          slug: string;
          description?: string | null;
          logo_url?: string | null;
          banner_url?: string | null;
          primary_color?: string;
          secondary_color?: string;
          category_id?: number | null;
          is_active?: boolean;
          member_count?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: number;
          name?: string;
          slug?: string;
          description?: string | null;
          logo_url?: string | null;
          banner_url?: string | null;
          primary_color?: string;
          secondary_color?: string;
          category_id?: number | null;
          is_active?: boolean;
          member_count?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      members: {
        Row: {
          id: string;
          username: string;
          first_name: string | null;
          last_name: string | null;
          description: string | null;
          avatar_url: string | null;
          creator_display_name: string | null;
          creator_avatar_url: string | null;
          is_verified: boolean;
          message_count: number;
          legacy_member_id: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          username: string;
          first_name?: string | null;
          last_name?: string | null;
          description?: string | null;
          avatar_url?: string | null;
          creator_display_name?: string | null;
          creator_avatar_url?: string | null;
          is_verified?: boolean;
          legacy_member_id?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          username?: string;
          first_name?: string | null;
          last_name?: string | null;
          description?: string | null;
          avatar_url?: string | null;
          creator_display_name?: string | null;
          creator_avatar_url?: string | null;
          is_verified?: boolean;
          legacy_member_id?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      community_members: {
        Row: {
          id: number;
          community_id: number;
          member_id: string;
          joined_at: string;
        };
        Insert: {
          id?: number;
          community_id: number;
          member_id: string;
          joined_at?: string;
        };
        Update: {
          id?: number;
          community_id?: number;
          member_id?: string;
          joined_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'community_members_community_id_fkey';
            columns: ['community_id'];
            isOneToOne: false;
            referencedRelation: 'communities';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'community_members_member_id_fkey';
            columns: ['member_id'];
            isOneToOne: false;
            referencedRelation: 'members';
            referencedColumns: ['id'];
          },
        ];
      };
      chat_messages: {
        Row: {
          id: number;
          community_id: number;
          member_id: string | null;
          content: string | null;
          parent_id: number | null;
          repost_of_id: number | null;
          quote_of_id: number | null;
          image_urls: string[];
          like_count: number;
          dislike_count: number;
          reply_count: number;
          repost_count: number;
          edited_at: string | null;
          is_removed: boolean;
          removed_at: string | null;
          removed_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: number;
          community_id: number;
          member_id?: string | null;
          content?: string | null;
          parent_id?: number | null;
          repost_of_id?: number | null;
          quote_of_id?: number | null;
          image_urls?: string[];
          like_count?: number;
          dislike_count?: number;
          reply_count?: number;
          repost_count?: number;
          edited_at?: string | null;
          is_removed?: boolean;
          removed_at?: string | null;
          removed_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: number;
          community_id?: number;
          member_id?: string | null;
          content?: string | null;
          parent_id?: number | null;
          repost_of_id?: number | null;
          quote_of_id?: number | null;
          image_urls?: string[];
          like_count?: number;
          dislike_count?: number;
          reply_count?: number;
          repost_count?: number;
          edited_at?: string | null;
          is_removed?: boolean;
          removed_at?: string | null;
          removed_by?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'chat_messages_community_id_fkey';
            columns: ['community_id'];
            isOneToOne: false;
            referencedRelation: 'communities';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'chat_messages_member_id_fkey';
            columns: ['member_id'];
            isOneToOne: false;
            referencedRelation: 'members';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'chat_messages_removed_by_fkey';
            columns: ['removed_by'];
            isOneToOne: false;
            referencedRelation: 'members';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'chat_messages_parent_id_fkey';
            columns: ['parent_id'];
            isOneToOne: false;
            referencedRelation: 'chat_messages';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'chat_messages_repost_of_id_fkey';
            columns: ['repost_of_id'];
            isOneToOne: false;
            referencedRelation: 'chat_messages';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'chat_messages_quote_of_id_fkey';
            columns: ['quote_of_id'];
            isOneToOne: false;
            referencedRelation: 'chat_messages';
            referencedColumns: ['id'];
          },
        ];
      };
      message_likes: {
        Row: {
          id: number;
          message_id: number;
          member_id: string;
          created_at: string;
        };
        Insert: {
          id?: number;
          message_id: number;
          member_id: string;
          created_at?: string;
        };
        Update: {
          id?: number;
          message_id?: number;
          member_id?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'message_likes_message_id_fkey';
            columns: ['message_id'];
            isOneToOne: false;
            referencedRelation: 'chat_messages';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'message_likes_member_id_fkey';
            columns: ['member_id'];
            isOneToOne: false;
            referencedRelation: 'members';
            referencedColumns: ['id'];
          },
        ];
      };
      message_dislikes: {
        Row: {
          id: number;
          message_id: number;
          member_id: string;
          created_at: string;
        };
        Insert: {
          id?: number;
          message_id: number;
          member_id: string;
          created_at?: string;
        };
        Update: {
          id?: number;
          message_id?: number;
          member_id?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'message_dislikes_message_id_fkey';
            columns: ['message_id'];
            isOneToOne: false;
            referencedRelation: 'chat_messages';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'message_dislikes_member_id_fkey';
            columns: ['member_id'];
            isOneToOne: false;
            referencedRelation: 'members';
            referencedColumns: ['id'];
          },
        ];
      };
      articles: {
        Row: {
          id: number;
          community_id: number;
          author_id: string;
          title: string;
          slug: string;
          excerpt: string | null;
          body: string;
          cover_image_url: string | null;
          is_published: boolean;
          published_at: string | null;
          like_count: number;
          view_count: number;
          is_removed: boolean;
          removed_at: string | null;
          removed_by: string | null;
          is_ai_generated: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: number;
          community_id: number;
          author_id: string;
          title: string;
          slug: string;
          body: string;
          excerpt?: string | null;
          cover_image_url?: string | null;
          is_published?: boolean;
          published_at?: string | null;
          like_count?: number;
          view_count?: number;
          is_removed?: boolean;
          removed_at?: string | null;
          removed_by?: string | null;
          is_ai_generated?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: number;
          community_id?: number;
          author_id?: string;
          title?: string;
          slug?: string;
          body?: string;
          excerpt?: string | null;
          cover_image_url?: string | null;
          is_published?: boolean;
          published_at?: string | null;
          like_count?: number;
          view_count?: number;
          is_removed?: boolean;
          removed_at?: string | null;
          removed_by?: string | null;
          is_ai_generated?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'articles_community_id_fkey';
            columns: ['community_id'];
            isOneToOne: false;
            referencedRelation: 'communities';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'articles_author_id_fkey';
            columns: ['author_id'];
            isOneToOne: false;
            referencedRelation: 'members';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'articles_removed_by_fkey';
            columns: ['removed_by'];
            isOneToOne: false;
            referencedRelation: 'members';
            referencedColumns: ['id'];
          },
        ];
      };
      article_likes: {
        Row: {
          id: number;
          article_id: number;
          member_id: string;
          created_at: string;
        };
        Insert: {
          id?: number;
          article_id: number;
          member_id: string;
          created_at?: string;
        };
        Update: {
          id?: number;
          article_id?: number;
          member_id?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'article_likes_article_id_fkey';
            columns: ['article_id'];
            isOneToOne: false;
            referencedRelation: 'articles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'article_likes_member_id_fkey';
            columns: ['member_id'];
            isOneToOne: false;
            referencedRelation: 'members';
            referencedColumns: ['id'];
          },
        ];
      };
      chat_presence: {
        Row: {
          id: number;
          community_id: number;
          member_id: string;
          client_type: string;
          last_seen_at: string;
        };
        Insert: {
          id?: number;
          community_id: number;
          member_id: string;
          client_type?: string;
          last_seen_at?: string;
        };
        Update: {
          id?: number;
          community_id?: number;
          member_id?: string;
          client_type?: string;
          last_seen_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'chat_presence_community_id_fkey';
            columns: ['community_id'];
            isOneToOne: false;
            referencedRelation: 'communities';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'chat_presence_member_id_fkey';
            columns: ['member_id'];
            isOneToOne: false;
            referencedRelation: 'members';
            referencedColumns: ['id'];
          },
        ];
      };
      podcasts: {
        Row: {
          id: number;
          community_id: number;
          title: string;
          description: string | null;
          audio_url: string;
          duration_seconds: number | null;
          published_by: string | null;
          cover_image_url: string | null;
          youtube_video_id: string | null;
          is_live: boolean;
          is_published: boolean;
          like_count: number;
          is_removed: boolean | null;
          removed_at: string | null;
          removed_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: number;
          community_id: number;
          title: string;
          audio_url?: string;
          description?: string | null;
          duration_seconds?: number | null;
          published_by?: string | null;
          cover_image_url?: string | null;
          youtube_video_id?: string | null;
          is_live?: boolean;
          is_published?: boolean;
          like_count?: number;
          is_removed?: boolean | null;
          removed_at?: string | null;
          removed_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: number;
          community_id?: number;
          title?: string;
          audio_url?: string;
          description?: string | null;
          duration_seconds?: number | null;
          published_by?: string | null;
          cover_image_url?: string | null;
          youtube_video_id?: string | null;
          is_live?: boolean;
          is_published?: boolean;
          like_count?: number;
          is_removed?: boolean | null;
          removed_at?: string | null;
          removed_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'podcasts_community_id_fkey';
            columns: ['community_id'];
            isOneToOne: false;
            referencedRelation: 'communities';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'podcasts_published_by_fkey';
            columns: ['published_by'];
            isOneToOne: false;
            referencedRelation: 'members';
            referencedColumns: ['id'];
          },
        ];
      };
      podcast_likes: {
        Row: {
          id: number;
          podcast_id: number;
          member_id: string;
          created_at: string;
        };
        Insert: {
          id?: number;
          podcast_id: number;
          member_id: string;
          created_at?: string;
        };
        Update: {
          id?: number;
          podcast_id?: number;
          member_id?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'podcast_likes_podcast_id_fkey';
            columns: ['podcast_id'];
            isOneToOne: false;
            referencedRelation: 'podcasts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'podcast_likes_member_id_fkey';
            columns: ['member_id'];
            isOneToOne: false;
            referencedRelation: 'members';
            referencedColumns: ['id'];
          },
        ];
      };
      roles: {
        Row: {
          id: number;
          code: string;
          name: string;
        };
        Insert: {
          id?: number;
          code: string;
          name: string;
        };
        Update: {
          id?: number;
          code?: string;
          name?: string;
        };
        Relationships: [];
      };
      role_permissions: {
        Row: {
          id: number;
          role_id: number;
          permission: string;
        };
        Insert: {
          id?: number;
          role_id: number;
          permission: string;
        };
        Update: {
          id?: number;
          role_id?: number;
          permission?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'role_permissions_role_id_fkey';
            columns: ['role_id'];
            isOneToOne: false;
            referencedRelation: 'roles';
            referencedColumns: ['id'];
          },
        ];
      };
      community_member_roles: {
        Row: {
          id: number;
          community_id: number;
          member_id: string;
          role_id: number;
          granted_at: string;
          granted_by: string | null;
        };
        Insert: {
          id?: number;
          community_id: number;
          member_id: string;
          role_id: number;
          granted_at?: string;
          granted_by?: string | null;
        };
        Update: {
          id?: number;
          community_id?: number;
          member_id?: string;
          role_id?: number;
          granted_at?: string;
          granted_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'community_member_roles_community_id_fkey';
            columns: ['community_id'];
            isOneToOne: false;
            referencedRelation: 'communities';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'community_member_roles_member_id_fkey';
            columns: ['member_id'];
            isOneToOne: false;
            referencedRelation: 'members';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'community_member_roles_role_id_fkey';
            columns: ['role_id'];
            isOneToOne: false;
            referencedRelation: 'roles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'community_member_roles_granted_by_fkey';
            columns: ['granted_by'];
            isOneToOne: false;
            referencedRelation: 'members';
            referencedColumns: ['id'];
          },
        ];
      };
      member_restrictions: {
        Row: {
          id: number;
          community_id: number;
          member_id: string;
          restriction_type: string;
          reason: string | null;
          starts_at: string;
          ends_at: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: number;
          community_id: number;
          member_id: string;
          restriction_type: string;
          reason?: string | null;
          starts_at?: string;
          ends_at?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: number;
          community_id?: number;
          member_id?: string;
          restriction_type?: string;
          reason?: string | null;
          starts_at?: string;
          ends_at?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'member_restrictions_community_id_fkey';
            columns: ['community_id'];
            isOneToOne: false;
            referencedRelation: 'communities';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'member_restrictions_member_id_fkey';
            columns: ['member_id'];
            isOneToOne: false;
            referencedRelation: 'members';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'member_restrictions_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'members';
            referencedColumns: ['id'];
          },
        ];
      };
      article_comments: {
        Row: {
          id: number;
          article_id: number;
          member_id: string;
          content: string;
          parent_id: number | null;
          reply_count: number;
          is_removed: boolean;
          removed_at: string | null;
          removed_by: string | null;
          created_at: string;
          updated_at: string | null;
        };
        Insert: {
          id?: number;
          article_id: number;
          member_id: string;
          content: string;
          parent_id?: number | null;
          reply_count?: number;
          is_removed?: boolean;
          removed_at?: string | null;
          removed_by?: string | null;
          created_at?: string;
          updated_at?: string | null;
        };
        Update: {
          id?: number;
          article_id?: number;
          member_id?: string;
          content?: string;
          parent_id?: number | null;
          reply_count?: number;
          is_removed?: boolean;
          removed_at?: string | null;
          removed_by?: string | null;
          created_at?: string;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'article_comments_article_id_fkey';
            columns: ['article_id'];
            isOneToOne: false;
            referencedRelation: 'articles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'article_comments_member_id_fkey';
            columns: ['member_id'];
            isOneToOne: false;
            referencedRelation: 'members';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'article_comments_parent_id_fkey';
            columns: ['parent_id'];
            isOneToOne: false;
            referencedRelation: 'article_comments';
            referencedColumns: ['id'];
          },
        ];
      };
      notification_mutes: {
        Row: {
          member_id: string;
          community_id: number;
          created_at: string;
        };
        Insert: {
          member_id: string;
          community_id: number;
          created_at?: string;
        };
        Update: {
          member_id?: string;
          community_id?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'notification_mutes_member_id_fkey';
            columns: ['member_id'];
            isOneToOne: false;
            referencedRelation: 'members';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'notification_mutes_community_id_fkey';
            columns: ['community_id'];
            isOneToOne: false;
            referencedRelation: 'communities';
            referencedColumns: ['id'];
          },
        ];
      };
      notifications: {
        Row: {
          id: number;
          recipient_id: string;
          actor_id: string | null;
          type: 'comment_reply' | 'comment_reply_thread' | 'comment_on_article' | 'article_published' | 'chat_reply' | 'mention';
          article_id: number | null;
          comment_id: number | null;
          community_id: number | null;
          group_key: string | null;
          actor_count: number;
          is_read: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: number;
          recipient_id: string;
          actor_id?: string | null;
          type: 'comment_reply' | 'comment_reply_thread' | 'comment_on_article' | 'article_published' | 'chat_reply' | 'mention';
          article_id?: number | null;
          comment_id?: number | null;
          community_id?: number | null;
          group_key?: string | null;
          actor_count?: number;
          is_read?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: number;
          recipient_id?: string;
          actor_id?: string | null;
          type?: 'comment_reply' | 'comment_reply_thread' | 'comment_on_article' | 'article_published' | 'chat_reply' | 'mention';
          article_id?: number | null;
          comment_id?: number | null;
          community_id?: number | null;
          group_key?: string | null;
          actor_count?: number;
          is_read?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'notifications_recipient_id_fkey';
            columns: ['recipient_id'];
            isOneToOne: false;
            referencedRelation: 'members';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'notifications_actor_id_fkey';
            columns: ['actor_id'];
            isOneToOne: false;
            referencedRelation: 'members';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'notifications_community_id_fkey';
            columns: ['community_id'];
            isOneToOne: false;
            referencedRelation: 'communities';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      get_email_from_username: {
        Args: { uname: string };
        Returns: string | null;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
