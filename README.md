🧩 Social Media Database System — MongoDB + Neo4j
📘 Project Overview

This project was built as part of a Database Systems case study with the goal of exploring NoSQL data modeling, graph relationships, and real-world data queries.
The system simulates a social media platform, integrating MongoDB Atlas for document-based content storage and Neo4j Aura for relationship-driven insights.

While originally designed for academic evaluation, this project also serves as a portfolio-quality implementation of how modern social networks manage data at scale — making it a strong demonstration of practical database engineering skills.

🎯 Objectives

To design and implement a realistic social media data model using NoSQL technologies.

To explore both document-based and graph-based databases.

To execute and analyze complex queries for understanding relationships, engagement, and trends.

To demonstrate industry-standard database design that’s directly applicable in full-stack applications.

🧱 Tech Stack
Layer	Technology	Purpose
Database 1	MongoDB Atlas	Stores user profiles, posts, comments, likes, hashtags
Database 2	Neo4j Aura	Stores user–user relationships (follows, mutuals, recommendations)
Backend Runtime	Node.js (for testing connections & seeding)	Data generation and seeding scripts
Language	JavaScript / Cypher	MongoDB Aggregations and Neo4j Queries

🗂️ Project Structure
social-db/
│
├── .env                   # Contains credentials (MongoDB URI, Neo4j URI, passwords)
├── .gitignore             # Excludes node_modules, .env, and temp files
├── package.json           # Node project metadata & scripts
├── seed.js                # Seeds both MongoDB & Neo4j with synthetic data
├── testMongo.js           # Verifies MongoDB connection
├── testNeo4j.js           # Verifies Neo4j connection
│
├── queries/
│   ├── mongo.js           # MongoDB analytics and engagement queries
│   ├── neo4j.cql          # Neo4j Cypher queries (followers, influence, paths)
│   └── feed.js            # Cross-database experiment: combining Neo4j relationships with MongoDB posts
│
└── README.md              # Project documentation

💡 Learning Outcome

This project deepened understanding of:

NoSQL design principles — schema flexibility, denormalization, and aggregation.
Graph database modeling — nodes, edges, traversal, and multi-hop queries.
Integrating heterogeneous data stores for full-stack systems.
Query performance and indexing differences between MongoDB and Neo4j.
