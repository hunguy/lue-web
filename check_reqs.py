import pkg_resources
print("aiohttp:", any(pkg.key == 'aiohttp' for pkg in pkg_resources.working_set))
print("fastapi:", any(pkg.key == 'fastapi' for pkg in pkg_resources.working_set))
