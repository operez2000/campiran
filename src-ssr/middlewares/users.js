import express from 'express'
// import fetch from 'node-fetch'

export default async ({ app }) => {
  app.use(express.json())
  app.use(express.urlencoded({ extended: true }))

  // Rutas
  app.post('/api/users/create', async (req, res) => {
    try {
      const { email, password } = req.body

      console.log('req.body', req.body)

      const response = await fetch(`${process.env.SUPABASE_URL}/auth/v1/admin/users`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
          apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      })

      const data = await response.json()
      res.status(response.status).json(data)
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Server error' })
    }
  })

  app.post('/api/users/login', async (req, res) => {
    try {
      console.log(JSON.stringify(req.body))
      res.json({
        response: 200,
        message: 'Ok',
        data: req.body
      })
    } catch (error) {
      console.log(error)
      res.json({
        response: 500,
        message: error.message
      })
    }
  })

}
