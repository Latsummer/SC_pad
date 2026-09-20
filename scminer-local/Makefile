.PHONY: deploy preview

# 部署到 EdgeOne Pages（scminer-site 项目，全球可用区·不含中国大陆，免备案）
deploy:
	cd dist && edgeone makers deploy -n scminer-site -a overseas

# 部署到 preview 环境（验证用，不影响生产）
preview:
	cd dist && edgeone makers deploy -n scminer-site -a overseas -e preview
