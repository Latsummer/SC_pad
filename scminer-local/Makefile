# 以下命令在 scminer-local/ 目录执行；数据同步与采集助手构建见根目录 Makefile。
.PHONY: deploy preview

# 将当前 dist/ 发布到 EdgeOne Pages 正式环境，会更新线上网站。
# 项目 scminer，区域 overseas（不含中国大陆）；需已安装并登录 EdgeOne CLI。
deploy:
	cd dist && edgeone makers deploy -n scminer -a overseas

# 将当前 dist/ 发布到同项目的 preview 预览环境，用于上线前验证，不更新正式环境。
# 需已安装并登录 EdgeOne CLI；本目标仅部署，不构建或同步数据。
preview:
	cd dist && edgeone makers deploy -n scminer -a overseas -e preview
