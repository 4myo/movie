import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const authHeader = req.headers.get('Authorization')

    if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
      return new Response(JSON.stringify({ message: 'Missing Supabase function secrets' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (!authHeader) {
      return new Response(JSON.stringify({ message: 'Missing authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: authHeader
        }
      }
    })

    const {
      data: { user },
      error: userError
    } = await userClient.auth.getUser()

    if (userError || !user) {
      return new Response(JSON.stringify({ message: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey)

    const [favoritesResult, recentlyWatchedResult] = await Promise.all([
      adminClient.from('favorite_movies').delete().eq('user_id', user.id),
      adminClient.from('recently_watched').delete().eq('user_id', user.id)
    ])

    if (favoritesResult.error) {
      throw favoritesResult.error
    }

    if (recentlyWatchedResult.error) {
      throw recentlyWatchedResult.error
    }

    const { error: deleteUserError } = await adminClient.auth.admin.deleteUser(user.id)

    if (deleteUserError) {
      throw deleteUserError
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (error) {
    return new Response(JSON.stringify({ message: error instanceof Error ? error.message : 'Delete account failed' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
