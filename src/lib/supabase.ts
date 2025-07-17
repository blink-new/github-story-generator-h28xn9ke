import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://cynwtzinwaociubrvych.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN5bnd0emlud2FvY2l1YnJ2eWNoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI1MzYzMDMsImV4cCI6MjA2ODExMjMwM30.OSq0NkthVq-KFqQjInoZxjVTP7Ufx0_q7RdCS3_cKe0'

// Store the current JWT token
let currentJWT: string | null = null

// Create client with anon key
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false
  },
  global: {
    headers: {},
    fetch: (url, options = {}) => {
      // Add the JWT token to every request if available
      if (currentJWT) {
        const headers = new Headers(options.headers || {})
        headers.set('Authorization', `Bearer ${currentJWT}`)
        options.headers = headers
      }
      return fetch(url, options)
    }
  }
})

// Function to set the JWT token for authenticated requests
export const setSupabaseAuth = (jwt: string | null) => {
  currentJWT = jwt
  console.log('Supabase auth token set:', jwt ? 'Token provided' : 'No token')
}