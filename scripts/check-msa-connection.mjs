// Read-only upstream diagnostic, explicitly requested through Actions. It does
// not modify the public history or interfere with an active daily retry cycle.
import { fetchMsaText, discoverMsaWarningColumns } from '../server.mjs';
const start = Date.now();
const html = await fetchMsaText('https://www.msa.gov.cn/94df14ce1110415da44e67593e76619f/index.jhtml', 45000);
const columns = discoverMsaWarningColumns(html);
console.log(JSON.stringify({ status: 'ok', milliseconds: Date.now() - start, bytes: Buffer.byteLength(html), bureaus: columns.map(item => item.bureau) }));
