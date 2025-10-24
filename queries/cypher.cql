// Pick a user
MATCH (u:User) RETURN u.handle AS handle, u.mongoId AS mongoId LIMIT 1;

// Followers count
MATCH (u:User {handle: $handle})<-[:FOLLOWS]-(f)
RETURN count(f) AS followers;

// Following count
MATCH (u:User {handle: $handle})-[:FOLLOWS]->(x)
RETURN count(x) AS following;

// Who-to-follow (friends-of-friends not already followed, rank by mutuals)
MATCH (me:User {handle: $handle})-[:FOLLOWS]->(:User)-[:FOLLOWS]->(cand:User)
WHERE NOT (me)-[:FOLLOWS]->(cand) AND me <> cand
RETURN cand.handle AS candidate, count(*) AS mutuals
ORDER BY mutuals DESC
LIMIT 10;

// Reciprocal friends (mutual follows)
MATCH (a:User {handle: $handle})-[:FOLLOWS]->(b:User),
      (b)-[:FOLLOWS]->(a)
RETURN b.handle AS friend
LIMIT 20;

// Shortest path between two users (up to 5 hops)
MATCH (a:User {handle: $a}), (b:User {handle: $b}),
p = shortestPath((a)-[:FOLLOWS*..5]-(b))
RETURN p;
