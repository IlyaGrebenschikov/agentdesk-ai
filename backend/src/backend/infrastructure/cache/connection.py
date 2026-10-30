from redis.asyncio import Redis


def create_client(url: str) -> Redis:
    return Redis.from_url(url)
