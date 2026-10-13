.PHONY: deploy preview

# 部署到 EdgeOne Pages（scminer 项目，全球可用区·不含中国大陆，免备案）
deploy:
	cd dist && edgeone makers deploy -n scminer -a overseas

# 部署到 preview 环境（验证用，不影响生产）
preview:
	cd dist && edgeone makers deploy -n scminer -a overseas -e preview
