import { createServer } from 'http';
import { server as wisp } from '@mercuryworkshop/wisp-js/server';

const server = createServer((req, res) => {
  // cloak for non "upgrade" http sockets
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(`
    <!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>About Us | IXL Learning </title>
    <style>
        :root {
            --primary-green: #008746;
            --secondary-blue: #0076a3;
            --text-dark: #333333;
            --light-bg: #f4f7f6;
            --accent-yellow: #f4b400;
        }

        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
            font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
        }

        /* Navbar */
        .navbar {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 15px 50px;
            background: white;
            border-bottom: 1px solid #ddd;
        }

        .logo {
            font-size: 28px;
            font-weight: 800;
            color: var(--primary-green);
        }

        .nav-links {
            list-style: none;
            display: flex;
            gap: 20px;
        }

        .nav-links a {
            text-decoration: none;
            color: var(--text-dark);
            font-weight: 600;
        }

        /* Hero Section */
        .hero {
            background-color: var(--primary-green);
            color: white;
            text-align: center;
            padding: 80px 20px;
        }

        .hero h1 {
            font-size: 48px;
            margin-bottom: 20px;
        }

        .hero p {
            font-size: 20px;
            max-width: 700px;
            margin: 0 auto;
            line-height: 1.6;
        }

        /* Stats Section */
        .stats {
            display: flex;
            justify-content: space-around;
            padding: 40px 50px;
            background: white;
            box-shadow: 0 4px 6px rgba(0,0,0,0.05);
        }

        .stat-box {
            text-align: center;
        }

        .stat-number {
            font-size: 42px;
            font-weight: bold;
            color: var(--secondary-blue);
            margin-bottom: 5px;
        }

        .stat-label {
            font-size: 16px;
            color: #666;
            font-weight: 600;
        }

        /* Mission Section */
        .mission {
            padding: 80px 50px;
            background-color: var(--light-bg);
            text-align: center;
        }

        .mission h2 {
            font-size: 36px;
            color: var(--text-dark);
            margin-bottom: 20px;
        }

        .mission p {
            font-size: 18px;
            max-width: 800px;
            margin: 0 auto;
            line-height: 1.8;
            color: #555;
        }

        /* Features Section */
        .features {
            padding: 80px 50px;
            background: white;
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 40px;
        }

        .feature-box {
            border-top: 4px solid var(--accent-yellow);
            padding: 30px;
            background: #fdfdfd;
            border-radius: 4px;
            box-shadow: 0 2px 5px rgba(0,0,0,0.05);
        }

        .feature-box h3 {
            font-size: 22px;
            color: var(--text-dark);
            margin-bottom: 15px;
        }

        .feature-box p {
            color: #666;
            line-height: 1.6;
        }

        /* Footer */
        .footer {
            background-color: var(--text-dark);
            color: white;
            text-align: center;
            padding: 30px;
            font-size: 14px;
        }
    </style>
</head>
<body>

    <!-- Navbar -->
    <nav class="navbar">
        <div class="logo">IXL</div>
        <ul class="nav-links">
            <li><a href="#">Products</a></li>
            <li><a href="#">Curriculum</a></li>
            <li><a href="#">Membership</a></li>
            <li><a href="#">About Us</a></li>
        </ul>
    </nav>

    <!-- Hero Section -->
    <section class="hero">
        <h1>Unlocking Learning for All</h1>
        <p>At IXL, we are passionate about improving learning. We apply technology in thoughtful ways to ignite curiosity, creativity, and a lifelong desire for knowledge.</p>
    </section>

    <!-- Stats -->
    <section class="stats">
        <div class="stat-box">
            <div class="stat-number">200B+</div>
            <div class="stat-label">Questions Answered</div>
        </div>
        <div class="stat-box">
            <div class="stat-number">18M+</div>
            <div class="stat-label">Students</div>
        </div>
        <div class="stat-box">
            <div class="stat-number">K-12</div>
            <div class="stat-label">Comprehensive Curriculum</div>
        </div>
    </section>

    <!-- Mission -->
    <section class="mission">
        <h2>Our Mission</h2>
        <p>We build innovative, adaptive, and highly interactive learning experiences that meet students exactly where they are. By continuously updating our platform to match evolving educational needs, we provide teachers, parents, and administrators with the tools to inspire confident learners.</p>
    </section>

    <!-- Features -->
    <section class="features">
        <div class="feature-box">
            <h3>Real-Time Diagnostic</h3>
            <p>Our dynamic diagnostic offers a clear, up-to-date picture of exactly where your learners shine, paving the way for personalized next steps.</p>
        </div>
        <div class="feature-box">
            <h3>Personalized Guidance</h3>
            <p>Every student receives a completely unique, adaptive learning path. We provide real-time feedback, hints, and explanations to foster a growth mindset.</p>
        </div>
        <div class="feature-box">
            <h3>Actionable Analytics</h3>
            <p>We give families and educators detailed insights. Share ready-to-go progress reports to highlight achievements and make conferences productive.</p>
        </div>
    </section>

    <!-- Footer -->
    <footer class="footer">
        &copy; 2026 IXL Learning. All rights reserved.
    </footer>

</body>
</html>
  `);
});

// everything else with "upgrade" gets shoved to the wisp handler (if its a websocket)
server.on('upgrade', (req, socket, head) => {
  wisp.routeRequest(req, socket, head);
});

// listen on 3000
server.listen(3000, () => {
  console.log('Wisp server is actively listening on port 3000');
});
