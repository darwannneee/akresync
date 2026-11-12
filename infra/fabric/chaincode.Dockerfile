# Chaincode-as-a-Service untuk formal-records. Build dari ROOT repo:
#   docker build -f infra/fabric/chaincode.Dockerfile -t akresync/formal-records-cc:latest .
# Konteks harus memuat chaincode/package.json dan chaincode/dist/ (hasil `pnpm --filter @akreditasi/chaincode build`).
# CC_DIR bisa diganti (mis. .runtime/test-chaincode) untuk validasi pipeline.
FROM node:20-alpine
ARG CC_DIR=chaincode
WORKDIR /app
COPY ${CC_DIR}/package.json ./package.json
COPY ${CC_DIR}/dist/ ./dist/
# Pasang hanya dependensi runtime (fabric-contract-api, fabric-shim) sesuai versi di package.json;
# devDependencies / paket workspace sengaja dilewati karena dist sudah ter-bundle.
RUN node -e "const p=require('./package.json');p.devDependencies={};p.scripts={};require('fs').writeFileSync('package.json',JSON.stringify(p,null,2))" \
 && npm install --omit=dev --no-audit --no-fund && npm cache clean --force
ENV NODE_ENV=production
EXPOSE 9999
CMD ["sh", "-c", "npx fabric-chaincode-node server --chaincode-address=$CHAINCODE_SERVER_ADDRESS --chaincode-id=$CHAINCODE_ID"]
