// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  devtools: { enabled: true },

  modules: [
    '@nuxt/ui',
    '@nuxt/eslint',
    '@nuxt/content',
    '@nuxt/fonts',
    '@nuxt/icon',
    '@nuxt/image',
    '@nuxt/test-utils',
    'nuxt-vuefire'
  ],

  css: ['~/assets/css/main.css'],

  future: {
    compatibilityVersion: 4
  },

  runtimeConfig: {
    // Private keys are only available on the server
    // Example: apiSecret: '123',

    // Public keys that are exposed to the client-side
    public: {
      apiBaseUrl: 'REPLACE_WITH_YOUR_ACTUAL_API_BASE_URL' // Placeholder
    }
  },

  vuefire: {
    auth: true,
    config: {
      apiKey: "AIzaSyC6Wy9eIpenaD1t7QU-jJheP4M-DaSSIac",
      authDomain: "daxiom-ca-idam.firebaseapp.com",
      projectId: "daxiom-ca-idam"
    }
  },
  
  compatibilityDate: '2024-11-27'
})