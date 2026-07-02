import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  try {
    const { password } = await request.json();

    if (!password) {
      return NextResponse.json({ error: 'Password required' }, { status: 400 });
    }

    // 1. Get the authenticated user via server Supabase client
    const supabase = await createServerClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // 2. Verify password by attempting sign-in
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: user.email!,
      password,
    });

    if (signInError) {
      return NextResponse.json({ error: 'wrong_password' }, { status: 403 });
    }

    // 3. Delete avatar from storage (fire-and-forget)
    const { data: member } = await supabase
      .from('members')
      .select('avatar_url')
      .eq('id', user.id)
      .single();

    if (member?.avatar_url) {
      const match = member.avatar_url.match(/\/storage\/v1\/object\/public\/avatars\/(.+)/);
      if (match) {
        await supabase.storage.from('avatars').remove([match[1]]);
      }
    }

    // 4. Delete user via admin API (requires service role key)
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceRoleKey) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceRoleKey,
    );

    const { error: deleteError } = await adminClient.auth.admin.deleteUser(user.id);

    if (deleteError) {
      return NextResponse.json({ error: 'delete_failed' }, { status: 500 });
    }

    // 5. Sign out the session
    await supabase.auth.signOut();

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
